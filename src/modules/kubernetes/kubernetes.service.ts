import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  RequestTimeoutException,
} from '@nestjs/common';
import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  V1Deployment,
  V1Node,
  V1Pod,
  V1PodList,
  Exec as KubeExec,
  V1Status,
  BatchV1Api,
  V1Job,
} from '@kubernetes/client-node';
import { execSync } from 'child_process';
import { setTimeout } from 'timers/promises';
import { logCommandWithResult } from 'src/helpers/mainHelper';
import { existsSync } from 'fs';
import { ReplaceInFileConfig, replaceInFile } from 'replace-in-file';
import { Service } from '../service/entities/service.entity';
import { ServiceStatus } from 'src/enums/serviceStatus';
import { ServiceService } from '../service/service.service';
import * as stream from 'stream';
import { WinstonService } from '../winston/winston.service';
import { promises as fsPromises } from 'fs';
import { Configuration } from 'src/config/Configuration';
import { Organization } from '../organization/entities/organization.entity';

@Injectable()
export class KubernetesService {
  /**  An attribute to store execution results */
  private executionResult: any;

  /**  An attribute to store the commands */
  private command: string;

  /** Cluster name */
  // private nameSpace = 'default';

  /** The current organization representation */
    private organization: Organization

  /** The organization id */
  private organization_id: string;

  /** The service we want to run (ex: auth, drive, ...) */
  private service: string;

  /** The product that we want to use for the service (ex: auth-keycloak, drive-nextcloud, ...) */
  private product: string;

  /** The product version (ex: keycloak v1, v2 ...) */
  private version: string;

  /** The path of the ssh private key  */
  private readonly pathSshPrivateKey = '/root/id_ed25519';

  /** The current node */
  private node: V1Node = undefined;

  /** The service nodepool */
  private nodepool: string;

  /** true if node is ready */
  private isNodeReady: boolean;

  // K8s Initialization
  private k8s: KubeConfig;

  /** the path of the k8s configuration file */
  private k8sConfigFile: string;

  /** the kubctl command with the appropriate organization kubeconfig file */
  public kubectlConfig: string;

  private k8sApiApps: AppsV1Api;
  private k8sApiCore: CoreV1Api;
  private k8sApiBatch: BatchV1Api;

  /**  An variable holding the log level */
  private logLevel: string;

  constructor(
    @Inject(forwardRef(() => ServiceService))
    private readonly serviceService: ServiceService,
    private readonly logService: WinstonService,
  ) {}

  get nameSpace(): string {
    return this.organization_id;
  }

  /** set the k8s config file path with the appropriate organization kubeconfig file */
  private setK8sConfigFile() {
    this.k8sConfigFile = `${process.env.DATA_PATH}/${this.organization_id}/k8s/kubeconfig.yaml`;
  }

  /** set the kubctl command with the appropriate organization kubeconfig file*/
  private setKubectlConfig() {
    this.setK8sConfigFile();
    this.kubectlConfig = `kubectl --kubeconfig ${this.k8sConfigFile}`;
  }

  /** set k8s client with the appropriate organization kubeconfig file*/
  private setK8s() {
    this.setK8sConfigFile();
    this.k8s = new KubeConfig();
    this.k8s.loadFromFile(this.k8sConfigFile);
    this.k8sApiApps = this.k8s.makeApiClient(AppsV1Api);
    this.k8sApiCore = this.k8s.makeApiClient(CoreV1Api);
    this.k8sApiBatch = this.k8s.makeApiClient(BatchV1Api);
  }

  // ---------------------------------------------------------------------------------------
  // -----------------
  // NODE AND NODEPOOL
  // -----------------
  // ---------------------------------------------------------------------------------------

  /** Get node from the nodepool organization_id-service
   * @throws {InternalServerErrorException} when we can't list/get nodes inside/from the nodepool
   */
  private async getNode() {
    try {
      const result = await this.k8sApiCore.listNode(
        undefined,
        undefined,
        undefined,
        undefined,
        `nodepool=${this.organization_id}-${this.nodepool}`,
      );
      this.node = result.body.items[0];
      this.checkNodeReady();
    } catch (error) {
      console.log(error);
      console.log(
        `Error: Can't list/get nodes inside the ${this.organization_id}-${this.nodepool} nodepool`,
      );
      await this.logService.create({
        level: 'error',
        message: `Error: Can't list/get nodes inside the ${this.organization_id}-${this.nodepool} nodepool`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
        },
      });
      throw new InternalServerErrorException(
        `Can't list/get nodes inside the ${this.organization_id}-${this.nodepool} nodepool`,
      );
    }
  }

  private async getServiceNodepool() {
    let nodePool: string;
    const temp = await this.serviceService.getProductAndOrgVersion(
      this.service,
    );

    const product = temp.product;
    const organization_version = temp.organization_version;

    for (const version of product.versions) {
      if (version.version_id === organization_version.version_id) {
        nodePool = version.node_pool;
      }
    }

    return nodePool;
  }

  /**  Check the node ready condition.
   * If it is true this.isNodeReady is gonna be true otherwise it's gonna be false
   * */
  private checkNodeReady() {
    if (this.node && this.node.status.conditions) {
      for (const condition of this.node.status.conditions) {
        if (condition.type == 'Ready' && condition.status == 'True') {
          this.isNodeReady = true;
          return;
        }
      }
      this.isNodeReady = false;
      return;
    } else {
      this.isNodeReady = false;
      return;
    }
  }

  /** Create a node inside the nodepool organization_id-service
   * @throws {InternalServerErrorException} when we can't patch the nodepool organization_id-service
   * @throws {RequestTimeoutException} if the node is not created properly before the Timeout
   */
  private async checkNodesCreate(services: Service[]) {
    const successfullyCreatedNodes: string[] = [];
    let timeout = 0;
    const max =
      parseInt(process.env.NODE_CREATE_TIMEOUT) /
      parseInt(process.env.NODE_CHECK_CREATE_WAIT_TIME);
    let timePassed = 0;
    while (successfullyCreatedNodes.length < services.length && timeout < max) {
      console.log(
        `Checking nodes create, ${successfullyCreatedNodes.length} / ${services.length} please wait ..`,
      );
      await setTimeout(
        parseInt(process.env.NODE_CHECK_CREATE_WAIT_TIME) * 1000,
      );
      timePassed += parseInt(process.env.NODE_CHECK_CREATE_WAIT_TIME);
      console.log(`${timePassed} seconds have passed ..`);

      for (const service of services) {
        if (!successfullyCreatedNodes.includes(service.service_id)) {
          this.service = service.service_id;
          this.nodepool = await this.getServiceNodepool();

          await this.getNode();
          if (this.isNodeReady) {
            successfullyCreatedNodes.push(this.service);
          }
        }
      }
      timeout++;
    }
    if (timeout >= max) {
      await this.logService.create({
        level: 'error',
        message: `Error: Only ${successfullyCreatedNodes.length} / ${services.length} nodes were created successfully`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
        },
      });
      console.log(
        `Error: Only ${successfullyCreatedNodes.length} / ${services.length} nodes were created successfully`,
      );
      await this.deleteNodes(this.organization_id, services);
      // await this.revertCreateNodes(services);
      await this.logService.create({
        level: 'info',
        message: `Les noeuds ne sont pas bien créés`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
        },
      });
      throw new RequestTimeoutException('Les noeuds ne sont pas bien créés');
    }
    await this.logService.create({
      level: 'info',
      message: `${successfullyCreatedNodes.length} / ${services.length} successfully created nodes`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
      },
    });
    console.log('----------------------------------------------');
    console.log(
      `${successfullyCreatedNodes.length} / ${services.length} successfully created nodes`,
    );
    console.log('----------------------------------------------');
  }

  /** Delete the node
   * @throws {InternalServerErrorException} when the function couldn't delete the node
   */
  private async checkNodeDelete() {
    await this.logService.create({
      level: 'info',
      message: `Deleting node for ${this.service}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
      },
    });
    console.log('-------------------------------------------');
    console.log(`Deleting node for ${this.service}, please wait ...`);
    console.log('-------------------------------------------');

    // check if the node is deleted successfully
    await this.getNode();
    if (this.node) {
      let timePassed = 0;
      while (this.node) {
        await setTimeout(
          parseInt(process.env.NODE_CHECK_DELETE_WAIT_TIME) * 1000,
        );
        timePassed += parseInt(process.env.NODE_CHECK_DELETE_WAIT_TIME);
        console.log(`${timePassed} seconds have passed ..`);
        await this.getNode();
      }
    }
    await this.logService.create({
      level: 'info',
      message: `The node of ${this.service} is deleted successfully`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
      },
    });
    console.log('------------------------------');
    console.log(`The node of ${this.service} is deleted successfully`);
    console.log('------------------------------');
  }

  /**
   * Patch a node pool based on the organization_id and the service name
   * @param create True if you want to create nodes, false if you want to delete nodes
   */
  private async patchNodePool(nodePool: string, create: boolean) {
    const desiredNodes = create ? 1 : 0;
    this.command = `${this.kubectlConfig} patch nodepool ${nodePool} --type="merge" --patch='{"spec": {"desiredNodes": ${desiredNodes}}}'`;
    try {
      this.executionResult = execSync(this.command);
      await this.logService.create({
        level: 'info',
        message: `Command ${this.command}, Result: ${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      logCommandWithResult(this.command, this.executionResult);
    } catch (error) {
      logCommandWithResult(this.command, error);
      this.logService.create({
        level: 'error',
        message: `Can't patch nodepool ${this.organization_id}-${this.service}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
        },
      });
      throw new InternalServerErrorException(
        `Can't patch nodepool ${this.organization_id}-${this.service}`,
      );
    }
  }

  private async revertCreateNodes(services: Service[]) {
    console.log('--------------------------------------');
    console.log(`Error while creating nodes`);
    console.log(`Patching node pools to desiredNodes 0`);
    console.log('--------------------------------------');
    for (const service of services) {
      this.service = service.service_id;

      this.nodepool = await this.getServiceNodepool();
      await this.patchNodePool(`${this.organization_id}-${this.nodepool}`, false);
    }
  }

  /**
   * Create nodes for the specified services and wait till they are ready
   * @param organization_id Organization id
   * @param services The list of the services to create their nodes
   */
  async createNodes(organization_id: string, services: Service[]) {
    this.organization_id = organization_id;
    this.setK8s();
    this.setKubectlConfig();
    await this.logService.create({
      level: 'info',
      message: `Patching node pools to desiredNodes: 1`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
      },
    });
    console.log('--------------------------------------');
    console.log(`Patching node pools to desiredNodes: 1`);
    console.log('--------------------------------------');
    for (const service of services) {
      this.service = service.service_id;

      this.nodepool = await this.getServiceNodepool();

      try {
        await this.patchNodePool(`${this.organization_id}-${this.nodepool}`, true);
      } catch (error) {
        await this.logService.create({
          level: 'error',
          message: `Error while patching the node pool ${this.nodepool} to 1`,
          data: {
            organization_id: this.organization_id,
            context: 'services',
          },
        });
        console.log(`Error while patching the node pool ${this.nodepool} to 1`);
        console.log(error);
        await this.deleteNodes(this.organization_id, services);
        // await this.revertCreateNodes(services);
        throw new InternalServerErrorException('Création des noeuds failed');
      }
    }
    // check if nodes are created successfully
    await this.logService.create({
      level: 'info',
      message: `Check if nodes are created successfully`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
      },
    });
    console.log('---------------------------------------');
    console.log(`Check if nodes are created successfully`);
    console.log('---------------------------------------');

    await this.checkNodesCreate(services);
  }

  /**
   * Delete nodes for the specified services and wait till they are deleted
   * @param organization_id Organization id
   * @param services The list of the services to delete their nodes
   */
  async deleteNodes(organization_id: string, services: Service[]) {
      this.organization_id = organization_id;
      this.setK8s();
      this.setKubectlConfig();
      await this.logService.create({
        level: 'info',
        message: `Patching node pools to desiredNodes: 0`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      console.log('--------------------------------------');
      console.log(`Patching node pools to desiredNodes: 0`);
      console.log('--------------------------------------');
      for (const service of services) {
        // if (service.service_id !== 'frontal') {
        this.service = service.service_id;
        this.nodepool = await this.getServiceNodepool();

        const canDelNode = await this.serviceService.canDeleteNode(
          this.organization_id,
          this.service,
        );

        if (canDelNode) {
          try {
            await this.patchNodePool(
              `${this.organization_id}-${this.nodepool}`,
              false,
            );
          } catch (error) {
            await this.logService.create({
              level: 'error',
              message: `${error.message}`,
              data: {
                organization_id: this.organization_id,
                context: 'services',
                admin: true,
              },
            });
            console.log(error);
            // await this.serviceRepository.update(
            //   { service_id: this.service },
            //   { is_deleting: false },
            // );
            continue;
          }
          // }
        }
      }
      // check if nodes are deleted successfully
      console.log('---------------------------------------');
      console.log(`Check if nodes are deleted successfully`);
      console.log('---------------------------------------');
      for (const service of services) {
        this.service = service.service_id;
        this.nodepool = await this.getServiceNodepool();

        const canDelNode = await this.serviceService.canDeleteNode(
          this.organization_id,
          this.service,
        );

        if (canDelNode) {
          try {
            await this.checkNodeDelete();
          } catch (error) {
            await this.logService.create({
              level: 'error',
              message: `${error.message}`,
              data: {
                organization_id: this.organization_id,
                context: 'services',
                admin: true,
              },
            });
            console.log(error);
            // await this.serviceRepository.update(
            //   { service_id: this.service },
            //   { is_deleting: false },
            // );
            continue;
          }
        }
      }
  }

  // -------------------------------------------------
  // ----
  // PODS
  // ----
  // -------------------------------------------------

  public async findPod(organization_id: string, service: string) {
    this.organization_id = organization_id;

    this.setK8s();
    this.setKubectlConfig();

    const servicesRes = await this.k8sApiCore.listNamespacedPod(this.nameSpace);
    if (
      servicesRes.response.statusCode &&
      servicesRes.response.statusCode >= 200 &&
      servicesRes.response.statusCode < 300
    ) {
      const pods: V1PodList = servicesRes.body;

      const wantedPod = pods.items.filter(
        (s) =>
          s.metadata?.name?.includes(service) &&
          s.metadata?.name?.includes(this.organization_id),
      );

      if (wantedPod.length > 0) {
        return wantedPod.at(0);
      }
    }

    return undefined;
  }

  private streamToString(stream: stream.Stream): Promise<String> {
    const chunks: any[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }

  public async execCommand(
    organization_id: string,
    pod: V1Pod,
    command: string,
  ): Promise<{
    success: boolean;
    content: String;
  }> {
    this.organization_id = organization_id;
    const podName: string = pod.metadata?.name ?? 'N/A';
    // const podName:string = pod.spec?.nodeName?? 'N/A';
    const podContainerName: string = pod.spec?.containers?.at(0)?.name ?? 'N/A';
    // pod.spec?.containers.forEach

    const executor = new KubeExec(this.k8s);

    const inStream = new stream.PassThrough();
    const outStream = new stream.PassThrough();
    const errStream = new stream.PassThrough();
    let execStatus: V1Status = new V1Status();

    await executor.exec(
      this.nameSpace,
      podName,
      podContainerName,
      ['/bin/bash', '-c', command],
      /*process.stdout as stream.Writable*/ outStream,
      /*process.stderr as stream.Writable*/ errStream,
      /*process.stdin as stream.Readable*/ inStream,
      true /* tty */,
      (status: V1Status) => {
        // Put status in a persistent variable
        execStatus = status;
      },
    );

    const resString = await this.streamToString(outStream);
    const errString = await this.streamToString(errStream);

    if (
      execStatus.status == 'Success' /*&& resString*/ &&
      !errString &&
      resString.includes('error') == false &&
      resString.includes('undefined') == false
    ) {
      return { success: true, content: resString };
    } else {
      console.debug('K8S Exec Failed !', 'Command was :', command);
      console.error(errString);
      return { success: false, content: errString };
    }
  }

  // ---------------------------------------------------------------------------------------
  // ------------------------------------------
  // SYNCHRONIZATION PODS AND DATA SAVE/RESTORE
  // ------------------------------------------
  // ---------------------------------------------------------------------------------------

  /**  Get synchronization pod
   * @returns the synchro pod, otherwise it return undefined if it's not found
   */
  private async getSynchroPod() {
    try {
      const result = await this.k8sApiCore.readNamespacedPod(
        `${this.organization_id}-${this.service}-${this.product}-synchro`,
        this.nameSpace,
      );
      return result.body;
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      return undefined;
    }
  }

  private isChromePodCompleted(pod: V1Pod) {
    if (pod && pod.status.phase) {
      if (pod.status.phase == 'Succeeded') {
        return 1;
      } else if (pod.status.phase == 'Failed') {
        return 2;
      } else {
        return 0;
      }
    } else {
      return 0;
    }
  }

  public async startChromPuppeeterPod(organization_id: string, organization: Organization) {
    await this.logService.create({
      level: 'info',
      message: `Creating chrome puppeeter pod`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
      },
    });
    console.log('----------------------------------------------');
    console.log('Creating chrome puppeeter pod, please wait ...');
    console.log('----------------------------------------------');

    // TODO : à tester le -- before the list of args
    // TODO : meilleure gestion d'erreur, le connecteur doit être en échec si la connexion à Roundcube vian puppeeter n'a pas réussi (mauvais identifiants = pas de connexion = pas d'import du CSV)
    this.command = `${this.kubectlConfig} run ${organization_id}-chrome-puppeeter --image=ghcr.io/apitechfr/roundcube-login-check-ts:1.0 --restart=Never -- --auth-type oauth --host ${organization.organization_env.services_url.mail} --username ${organization.organization_env.services_credentials.MAILSERVER_POSTMASTER_USERNAME} --password ${organization.organization_env.services_credentials.MAILSERVER_POSTMASTER_PASSWORD}`;

    try {
      this.executionResult = execSync(this.command);
      logCommandWithResult(this.command, this.executionResult);
    } catch (error) {
      logCommandWithResult(this.command, this.executionResult);
      await this.deleteChromPuppeeterPod(organization_id);
      await this.logService.create({
        level: 'error',
        message: `Can't start chrome puppeeter pod with kubectl`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
        },
      });
      throw new InternalServerErrorException(
        `Can't start chrome puppeeter pod with kubectl`,
      );
    }

    // check if the synchro pod is created successfully
    let chromePuppeeterPod = await this.findPod(
      organization_id,
      'chrome-puppeeter',
    );
    if (this.isChromePodCompleted(chromePuppeeterPod) !== 1) {
      // Wait till the pod is ready
      let timeout = 0;
      const max =
        parseInt(process.env.SERVICE_CREATE_TIMEOUT) /
        parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME);
      // while (!this.isChromePodCompleted(chromePuppeeterPod) && timeout <= max) {
      while (
        this.isChromePodCompleted(chromePuppeeterPod) !== 1 &&
        timeout <= max
      ) {
        if (this.isChromePodCompleted(chromePuppeeterPod) === 2) {
          break;
        }
        await setTimeout(
          parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME) * 1000,
        );
        chromePuppeeterPod = await this.findPod(
          organization_id,
          'chrome-puppeeter',
        );
        timeout++;
      }
      if (timeout > max) {
        await this.logService.create({
          level: 'warn',
          message: `Create chrome puppeeter pod timeout`,
          data: {
            organization_id: this.organization_id,
            context: 'services',
            admin: true,
          },
        });
        console.log('Create chrome puppeeter pod timeout');
        await this.deleteChromPuppeeterPod(organization_id);
        throw new RequestTimeoutException(
          'Create chrome puppeeter pod timeout',
        );
      } else if (this.isChromePodCompleted(chromePuppeeterPod) === 2) {
        await this.logService.create({
          level: 'warn',
          message: `Error in chrome-puppeeter pod`,
          data: {
            organization_id: this.organization_id,
            context: 'services',
            admin: true,
          },
        });
        console.log('Error in chrome-puppeeter pod');
        await this.deleteChromPuppeeterPod(organization_id);
        throw new InternalServerErrorException('Error in chrome-puppeeter pod');
      } else {
        await this.logService.create({
          level: 'info',
          message: `Chrome puppeeter pod is completed`,
          data: {
            organization_id: this.organization_id,
            context: 'services',
            admin: true,
          },
        });
        console.log('---------------------------------');
        console.log('Chrome puppeeter pod is completed');
        console.log('---------------------------------');
      }
    }
  }

  public async deleteChromPuppeeterPod(organization_id: string) {
    await this.logService.create({
      level: 'info',
      message: `Deleting chrome puppeeter pod, please wait ...`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('----------------------------------------------');
    console.log('Deleting chrome puppeeter pod, please wait ...');
    console.log('----------------------------------------------');

    this.command = `${this.kubectlConfig} delete pod ${organization_id}-chrome-puppeeter`;
    try {
      this.executionResult = execSync(this.command);
      await this.logService.create({
        level: 'info',
        message: `${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      this.executionResult = error;
      throw new InternalServerErrorException(
        `Can't delete chrome puppeeter pod with kubectl`,
      );
    }
    logCommandWithResult(this.command, this.executionResult);

    let chromePod = await this.findPod(organization_id, 'chrome-puppeeter');
    if (chromePod) {
      while (chromePod) {
        await setTimeout(
          parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME) * 1000,
        );
        chromePod = await this.getSynchroPod();
      }
    }
    console.log('------------------------------------------------');
    console.log(`The chrome puppeeter pod is deleted successfully`);
    console.log('------------------------------------------------');
  }

  /** check synchronization pod running status and ready condition
   * @param pod the synchro pod to check
   * @returns true if the synchro pod is running and ready, false otherwise
   */
  private isSynchroReady(pod: V1Pod) {
    if (pod && pod.status.phase && pod.status.conditions) {
      if (pod.status.phase == 'Running') {
        for (const condition of pod.status.conditions) {
          if (condition.type == 'Ready' && condition.status == 'True') {
            return true;
          }
        }
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  /** Start the synchronization pod by executing `kubectl apply -f`
   * @param timestamp (the snapshot) the generated timestamp the moment of the service delete
   * @throws {InternalServerErrorException} when the command `kubectl apply -f` didn't work
   * @throws {RequestTimeoutException} if the synchro pod is not created properly before the Timeout
   */
  private async startSynchroPod(timestamp: string) {
    const snapshotVersionPath = `${process.env.DATA_PATH}/${this.organization_id}/service/${this.service}/${this.product}/${this.version}`;
    await this.logService.create({
      level: 'info',
      message: `Creating synchro pod`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('-------------------------------------');
    console.log('Creating synchro pod, please wait ...');
    console.log('-------------------------------------');
    this.command = `${this.kubectlConfig} apply -f ${snapshotVersionPath}/${timestamp}/config/synchro.yaml`;
    try {
      this.executionResult = execSync(this.command);
      await this.logService.create({
        level: 'info',
        message: `${this.command}: ${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      logCommandWithResult(this.command, this.executionResult);
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${this.command}: ${error}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      logCommandWithResult(this.command, error);
      throw new InternalServerErrorException(
        `Can't start synchro pod with kubectl`,
      );
    }

    // check if the synchro pod is created successfully
    let synchroPod = await this.getSynchroPod();
    if (!this.isSynchroReady(synchroPod)) {
      // Wait till the synchro pod is ready
      let timeout = 0;
      const max =
        parseInt(process.env.SERVICE_CREATE_TIMEOUT) /
        parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME);
      while (!this.isSynchroReady(synchroPod) && timeout <= max) {
        await setTimeout(
          parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME) * 1000,
        );
        synchroPod = await this.getSynchroPod();
        timeout++;
      }
      if (timeout > max) {
        await this.logService.create({
          level: 'info',
          message: `Create synchro pod timeout`,
          data: {
            organization_id: this.organization_id,
            context: 'services',
            admin: true,
          },
        });
        console.log('Create synchro pod timeout');
        throw new RequestTimeoutException('Create synchro pod timeout');
      }
    }
    console.log('---------------------------------------');
    await this.logService.create({
      level: 'info',
      message: `The synchro pod ${synchroPod.metadata.name} is created successfully`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
      },
    });
    console.log(
      `The synchro pod ${synchroPod.metadata.name} is created successfully`,
    );
    console.log('---------------------------------------');
  }

  /** Stop the synchronization pod by executing `kubectl delete -f`
   */
  private async stopSynchroPod(timestamp: string) {
    const snapshotVersionPath = `${process.env.DATA_PATH}/${this.organization_id}/service/${this.service}/${this.product}/${this.version}`;

    await this.logService.create({
      level: 'info',
      message: `Deleting synchro pod`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('-------------------------------------');
    console.log('Deleting synchro pod, please wait ...');
    console.log('-------------------------------------');
    this.command = `${this.kubectlConfig} delete -f ${snapshotVersionPath}/${timestamp}/config/synchro.yaml`;
    try {
      this.executionResult = execSync(this.command);
      await this.logService.create({
        level: 'info',
        message: `${this.command}: ${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
    } catch (error) {
      this.executionResult = error;
      await this.logService.create({
        level: 'error',
        message: `${this.command}: ${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      throw new InternalServerErrorException(
        `Can't delete synchro pod with kubectl`,
      );
    }
    logCommandWithResult(this.command, this.executionResult);

    // check if synchro pod is deleted successfully
    let synchroPod = await this.getSynchroPod();
    if (synchroPod) {
      while (synchroPod) {
        await setTimeout(
          parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME) * 1000,
        );
        synchroPod = await this.getSynchroPod();
      }
    }
    await this.logService.create({
      level: 'info',
      message: `The synchro pod of ${this.service} is deleted successfully`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
      },
    });

    await this.logService.create({
      level: 'info',
      message: `The synchro pod of ${this.service} is deleted successfully`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('------------------------------');
    console.log(`The synchro pod of ${this.service} is deleted successfully`);
    console.log('------------------------------');
  }

  /**
   * Deploy the generated ssh private key
   * @throws {InternalServerErrorException} if the command that deploy the ssh private key didn't work
   */
  private async deploySshPrivateKey() {
    this.logService.create({
      level: 'info',
      message: `Deployment of ssh private key`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
      },
    });
    console.log('-----------------------------');
    console.log('Deployment of ssh private key');
    console.log('-----------------------------');
    this.command = `${this.kubectlConfig} cp ${process.env.DATA_PATH}/${this.organization_id}/ssh/id_ed25519 ${this.organization_id}-${this.service}-${this.product}-synchro:${this.pathSshPrivateKey}`;
    try {
      this.executionResult = execSync(this.command);
      logCommandWithResult(this.command, this.executionResult);
      await this.logService.create({
        level: 'info',
        message: `${this.command} : ${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
    } catch (error) {
      logCommandWithResult(this.command, error);
      await this.logService.create({
        level: 'error',
        message: `${this.command} : ${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      throw new InternalServerErrorException(
        `Can't deploy the generated ssh private key`,
      );
    }
  }

  /**
   * Restore the service data
   * @param timestamp (the based snapshot) the timestamp of the based snapshot
   */
  private async restoreServiceData(timestamp: string) {
    const organizationServiceProduct = `${this.organization_id}-${this.service}-${this.product}`;
    const dataPathOrganization = `${process.env.DATA_PATH}/${this.organization_id}`;
    const rsyncLogPathDest = `${dataPathOrganization}/service/${this.service}/${this.product}/${this.version}/active/log`;
    const rsyncLogPath = `/tmp/rsync.log`;

    // Création du dossier de restauration des données
    await this.logService.create({
      level: 'info',
      message: `Création du dossier de restauration des données`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('-----------------------------------------------');
    console.log('Création du dossier de restauration des données');
    console.log('-----------------------------------------------');
    this.command = `${this.kubectlConfig} exec ${organizationServiceProduct}-synchro -- mkdir -p ${dataPathOrganization}/${this.service}`;
    try {
      this.executionResult = execSync(this.command);
      await this.logService.create({
        level: 'info',
        message: `${this.command}, ${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
    } catch (error) {
      this.executionResult = error;
      await this.logService.create({
        level: 'error',
        message: `${this.command}, ${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
    }
    logCommandWithResult(this.command, this.executionResult);

    // Create the rsyncRestore.log file
    await this.logService.create({
      level: 'info',
      message: `Creating log directory and rsyncRestore.log file`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('------------------------------------------------');
    console.log('Creating log directory and rsyncRestore.log file');
    console.log('------------------------------------------------');
    this.command = `mkdir -p ${rsyncLogPathDest} && touch ${rsyncLogPathDest}/rsyncRestore.log`;
    try {
      this.executionResult = execSync(this.command);
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${this.command}, ${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      this.executionResult = error;
    }
    await this.logService.create({
      level: 'info',
      message: `${this.command}, ${this.executionResult}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    logCommandWithResult(this.command, this.executionResult);

    // Suppression fichier de log rsync si existe
    await this.logService.create({
      level: 'info',
      message: `Suppression fichier de log rsync si existe`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('---------------------------------------------');
    console.log('Suppression fichier de log rsync si existe');
    console.log('---------------------------------------------');
    this.command = `${this.kubectlConfig} exec ${organizationServiceProduct}-synchro -- rm -f ${rsyncLogPath}`;
    try {
      this.executionResult = execSync(this.command);
      this.logLevel = 'info';
    } catch (error) {
      this.executionResult = error;
      this.logLevel = 'error';
    }
    await this.logService.create({
      level: this.logLevel,
      message: `${this.command} : ${this.executionResult}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    logCommandWithResult(this.command, this.executionResult);

    // Restaurer les données
    await this.logService.create({
      level: 'info',
      message: `Restoring Data, please wait ...`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('-------------------------------');
    console.log('Restoring Data, please wait ...');
    console.log('-------------------------------');
    const useRsync = JSON.parse(process.env.USE_RSYNC.toLowerCase());
    this.command = `${
      this.kubectlConfig
    } exec ${organizationServiceProduct}-synchro -- rsync -avq${
      useRsync ? '' : 'n'
    } --delete --stats --log-file=${rsyncLogPath} -e 'ssh -o StrictHostKeyChecking=no -i ${
      this.pathSshPrivateKey
    } -p ${this.organization.organization_env.HOST_DATA_SSH_PORT}' ${
      process.env.HOST_DATA_SSH_ADDRESS
    }:${dataPathOrganization}/service/${this.service}/${this.product}/${
      this.version
    }/${timestamp}/data/ ${dataPathOrganization}/${this.service}/`;
    try {
      this.executionResult = execSync(this.command, {
        timeout: parseInt(process.env.RSYNC_TIMEOUT) * 1000,
      });
      this.logLevel = 'info';
    } catch (error) {
      this.executionResult = error;
      this.logLevel = 'error';
    }
    await this.logService.create({
      level: this.logLevel,
      message: `${this.command} : ${this.executionResult}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    logCommandWithResult(this.command, this.executionResult);

    await this.logService.create({
      level: 'info',
      message: `Get rsync restore log file from synchro pod`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('-----------------------------------------------');
    console.log('Get rsync restore log file from synchro pod');
    console.log('-----------------------------------------------');
    this.command = `${this.kubectlConfig} cp ${organizationServiceProduct}-synchro:${rsyncLogPath} ${rsyncLogPathDest}/rsyncRestore.log`;
    try {
      this.executionResult = execSync(this.command);
      this.logLevel = 'info';
    } catch (error) {
      this.executionResult = error;
      this.logLevel = 'error';
    }
    await this.logService.create({
      level: this.logLevel,
      message: `${this.command} : ${this.executionResult}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    logCommandWithResult(this.command, this.executionResult);
  }

  /**
   * Save the service Data
   * @param timestamp (the new snapshot) the generated timestamp the moment of the service delete
   * @param snapshotTimestamp The based on snapshot timestamp
   */
  private async saveServiceData(timestamp: string, snapshotTimestamp: string) {
    // Create the rsyncSave.log file
    const dataPathOrganization = `${process.env.DATA_PATH}/${this.organization_id}`;
    const snapshotPath = `${dataPathOrganization}/service/${this.service}/${this.product}/${this.version}/${timestamp}`;
    const basedOnSnapshotPath = `${dataPathOrganization}/service/${this.service}/${this.product}/${this.version}/${snapshotTimestamp}`;
    const rsyncLogPath = `/tmp/rsync.log`;
    const OrganizationServiceProduct = `${this.organization_id}-${this.service}-${this.product}`;

    // Suppression fichier de log rsync si existe
    await this.logService.create({
      level: 'info',
      message: `Suppression fichier de log rsync si existe`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('------------------------------------------');
    console.log('Suppression fichier de log rsync si existe');
    console.log('------------------------------------------');
    this.command = `${this.kubectlConfig} exec ${OrganizationServiceProduct}-synchro -- rm -f ${rsyncLogPath}`;
    try {
      this.executionResult = execSync(this.command);
      this.logLevel = 'info'
    } catch (error) {
      this.executionResult = error;
      this.logLevel = 'error'
    }
    await this.logService.create({
      level: this.logLevel,
      message: `${this.command} : ${this.executionResult}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    logCommandWithResult(this.command, this.executionResult);

    // Sauvegarde les donnéesectl cp
    await this.logService.create({
      level: 'info',
      message: `Saving Data, please wait ...`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('----------------------------');
    console.log('Saving Data, please wait ...');
    console.log('----------------------------');
    const useRsync = JSON.parse(process.env.USE_RSYNC.toLowerCase());
    let rsyncOk = false;
    this.command = `${
      this.kubectlConfig
    } exec ${OrganizationServiceProduct}-synchro -- rsync -avq${
      useRsync ? '' : 'n'
    } --delete --stats --log-file=${rsyncLogPath} -e 'ssh -o StrictHostKeyChecking=no -i ${
      this.pathSshPrivateKey
    } -p ${this.organization.organization_env.HOST_DATA_SSH_PORT}' --hard-links ${
      snapshotTimestamp ? `--link-dest=${basedOnSnapshotPath}/data` : ``
    } ${dataPathOrganization}/${this.service}/ ${
      process.env.HOST_DATA_SSH_ADDRESS
    }:${snapshotPath}/data/`;
    try {
      this.executionResult = execSync(this.command, {
        timeout: parseInt(process.env.RSYNC_TIMEOUT) * 1000,
      });
      rsyncOk = true;
      this.logLevel = 'info';
    } catch (error) {
      this.executionResult = error;
      this.logLevel = 'error';
    }
    await this.logService.create({
      level: this.logLevel,
      message: `${this.command} : ${this.executionResult}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    logCommandWithResult(this.command, this.executionResult);
    await this.logService.create({
      level: 'info',
      message: `Get rsync save log file from synchro pod`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('-----------------------------------------------');
    console.log('Get rsync save log file from synchro pod');
    console.log('-----------------------------------------------');
    this.command = `${this.kubectlConfig} cp ${OrganizationServiceProduct}-synchro:${rsyncLogPath} ${snapshotPath}/log/rsyncSave.log`;
    try {
      this.executionResult = execSync(this.command);
      this.logLevel = 'info';
    } catch (error) {
      this.executionResult = error;
      this.logLevel = 'error';
    }
    await this.logService.create({
      level: this.logLevel,
      message: `${this.command} : ${this.executionResult}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    logCommandWithResult(this.command, this.executionResult);
    if(!rsyncOk) {
      throw  new InternalServerErrorException("Rsync not executed successfully")
    }
  }

  // ---------------------------------------------------------------------------------------
  // ------------------------
  // SERVICES AND DEPLOYMENTS
  // ------------------------
  // ---------------------------------------------------------------------------------------

  private async getServiceDeployments() {
    try {
      const serviceDeployments = await this.k8sApiApps.listNamespacedDeployment(
        this.nameSpace,
      );
      const deployments: V1Deployment[] = [];
      for (const deployment of serviceDeployments.body.items) {
        if (
          deployment.metadata.name.startsWith(
            `${this.organization_id}-${this.service}`,
          )
        ) {
          deployments.push(deployment);
        }
      }
      return deployments;
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      console.log(error);
    }
  }

  /** Check if the service is already running, if it is, it throws an error, otherwise it creates the service */
  private async isAlreadyRunning(timestamp: number) {
    console.log('----------------------------------------------------------');
    console.log(`Check if the service ${this.service} is already running ..`);
    console.log('----------------------------------------------------------');
    const deployments = await this.getServiceDeployments();
    if (deployments.length) {
      for (let deployment of deployments) {
        if (!this.isDeploymentAvailable(deployment)) {
          return false;
        }
      }
      await this.serviceService.updateServiceStatus(
        this.organization_id,
        this.service,
        ServiceStatus.ACTIVE,
        // timestamp,
      );
      await this.logService.create({
        level: 'info',
        message: `The service ${this.service} is already running`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
        },
      });
      console.log(`The service ${this.service} is already running ..`);
      return true;
    } else {
      return false;
    }
  }

  /** Check if the service is already deleted, if it is, it throws an error, otherwise it deletes the service */
  private async isAlreadyDeleted() {
    let test: { deploymentsExist: boolean; deploymentsReady: boolean };
    console.log('----------------------------------------------------------');
    console.log(`Check if the service ${this.service} is already deleted ..`);
    console.log('----------------------------------------------------------');
    const deployments = await this.getServiceDeployments();
    if (deployments) {
      if (deployments.length) {
        let isAllDeploymentsReady: boolean = true;
        for (let deployment of deployments) {
          if (!this.isDeploymentAvailable(deployment)) {
            isAllDeploymentsReady = false;
          }
        }
        isAllDeploymentsReady = true;
        if (isAllDeploymentsReady) {
          test = { deploymentsExist: true, deploymentsReady: true };
          return test;
        } else {
          test = { deploymentsExist: true, deploymentsReady: false };
          return test;
        }
      } else {
        test = { deploymentsExist: false, deploymentsReady: false };
        console.log('The list of this service deployments is empty');
        await this.serviceService.updateServiceStatus(
          this.organization_id,
          this.service,
          ServiceStatus.INACTIVE,
        );
        await this.logService.create({
          level: 'info',
          message: `The service ${this.service} is already deleted`,
          data: {
            organization_id: this.organization_id,
            context: 'services',
          },
        });
        console.log(`The service ${this.service} is already deleted ..`);
        return test;
      }
    } else {
      test = { deploymentsExist: false, deploymentsReady: false };
      await this.logService.create({
        level: 'info',
        message: `There is no deployments for ${this.service}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
        },
      });
      console.log('There is no deployments for this service');
      await this.serviceService.updateServiceStatus(
        this.organization_id,
        this.service,
        ServiceStatus.INACTIVE,
      );
      await this.logService.create({
        level: 'info',
        message: `The service ${this.service} is already deleted`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
        },
      });
      console.log(`The service ${this.service} is already deleted ..`);
      return test;
      // return true;
    }
    // await this.serviceService.updateServiceStatus(
    //   this.organization_id,
    //   this.service,
    //   ServiceStatus.INACTIVE,
    //   // timestamp,
    // );
    // console.log(`The service ${this.service} is already deleted ..`);
    // return true;
  }

  /**  Get the deployment that has labels: app: organization_id-service-product-app
   * @returns a deployment, undefined if it is not found
   */
  private async getDeployment(name: string) {
    try {
      // const deploymentName = `${this.organization_id}-${this.service}-${this.product}-app`;
      const deployment = await this.k8sApiApps.readNamespacedDeployment(
        name,
        this.nameSpace,
      );
      return deployment.body;
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${this.command} : ${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      console.log(`Get Deployment result: ${error}`);
      return undefined;
    }
  }

  /**  Check the deployment available condition
   * @param deployment the deployment to check
   * @returns true if available condition is true, false otherwise
   */
  private isDeploymentAvailable(deployment: V1Deployment) {
    if (deployment && deployment.status.conditions) {
      for (const condition of deployment.status.conditions) {
        if (condition.type == 'Available' && condition.status == 'True') {
          return true;
        }
      }
      return false;
    } else {
      return false;
    }
  }

  /** Start a service by executing `kubectl apply -k`
   * @param snapshotTimestamp the timestamp of the based on snapshot
   * @throws {InternalServerErrorException} when the command `kubectl apply -k` didn't work
   * @throws {RequestTimeoutException} if the service is not created properly before the Timeout
   */
  private async lunchService(snapshotTimestamp: string) {
    const snapshotVersionPath = `${process.env.DATA_PATH}/${this.organization_id}/service/${this.service}/${this.product}/${this.version}`;
    // get template files fron config directory of the specified snapshot
    // otherwise from local (/usr/src/app/kubernetes)
    let configPath = `kubernetes/${this.service}/${this.product}/${this.version}`;
    if (snapshotTimestamp) {
      configPath = `${snapshotVersionPath}/${snapshotTimestamp}/config`;
    }

    // Creating the config and data directories
    console.log('----------------------------------------');
    console.log(`Creating the config and data directories`);
    console.log('----------------------------------------');
    this.command = `mkdir -p ${snapshotVersionPath}/active/config/ && mkdir -p ${snapshotVersionPath}/active/data/`;
    try {
      this.executionResult = execSync(this.command);
      this.logLevel = 'info';
    } catch (error) {
      this.executionResult = error;
      this.logLevel = 'error';
    }
    await this.logService.create({
      level: this.logLevel,
      message: `${this.command} : ${this.executionResult}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    logCommandWithResult(this.command, this.executionResult);

    // Copy the yaml files to the config directory
    await this.logService.create({
      level: 'info',
      message: `Copying the yaml files to config`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('--------------------------------');
    console.log(`Copying the yaml files to config`);
    console.log('--------------------------------');
    this.command = `cp -a ${configPath}/. ${snapshotVersionPath}/active/config/`;
    try {
      this.executionResult = execSync(this.command);
      this.logLevel = 'info';
    } catch (error) {
      this.executionResult = error;
      this.logLevel = 'error';
    }
    await this.logService.create({
      level: this.logLevel,
      message: `${this.command}, ${this.executionResult}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    logCommandWithResult(this.command, this.executionResult);

    if (!snapshotTimestamp) {
      // Replace the organization_id
      await this.logService.create({
        level: 'info',
        message: `Replacing the {{ORGANIZATION_ID}} in the yaml files`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      console.log('-------------------------------------------');
      console.log(`Replacing the {{ORGANIZATION_ID}} in the yaml files`);
      console.log('-------------------------------------------');
      const orgIdOptions: ReplaceInFileConfig = {
        files: [`${snapshotVersionPath}/active/config/**/*.yaml`],
        from: /{{ORGANIZATION_ID}}/g,
        to: this.organization_id,
      };
      try {
        await replaceInFile(orgIdOptions);
      } catch (error) {
        console.log('replacing {{ORGANIZATION_ID}} error: ' + error);
        await this.logService.create({
          level: 'error',
          message: `replacing {{ORGANIZATION_ID}} error: ' + error`,
          data: {
            organization_id: this.organization_id,
            context: 'services',
            admin: true,
          },
        });
      }

      // Replace the registry URL
      await this.logService.create({
        level: 'info',
        message: `Replacing the {{REGISTRY_URL}} in the yaml files`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      console.log('-------------------------------------------');
      console.log(`Replacing the {{REGISTRY_URL}} in the yaml files`);
      console.log('-------------------------------------------');
      const regUrlOptions: ReplaceInFileConfig = {
        files: [`${snapshotVersionPath}/active/config/**/*.yaml`],
        from: /{{REGISTRY_URL}}\//g,
        to: process.env.REGISTRY_URL ?? 'docker.io', // fallback to default (DockerHub) registry
      };
      try {
        await replaceInFile(orgIdOptions);
      } catch (error) {
        console.log('replacing {{REGISTRY_URL}} error: ' + error);
      }

      // Replace the nodePool
      const nodePool = await this.getServiceNodepool();
      await this.logService.create({
        level: 'info',
        message: `Replacing the {{NODEPOOL}} in the yaml files`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      console.log('-------------------------------------------');
      console.log(`Replacing the {{NODEPOOL}} in the yaml files`);
      console.log('-------------------------------------------');
      const nodePoolOptions: ReplaceInFileConfig = {
        files: [`${snapshotVersionPath}/active/config/**/*.yaml`],
        from: /{{NODEPOOL}}/g,
        to: `${this.organization_id}-${nodePool}`,
      };
      try {
        await replaceInFile(nodePoolOptions);
      } catch (error) {
        console.log('replacing {{NodePool}} error: ' + error);
        await this.logService.create({
          level: 'error',
          message: `replacing {{NodePool}} error: ' + error`,
          data: {
            organization_id: this.organization_id,
            context: 'services',
            admin: true,
          },
        });
      }
    }
    await this.logService.create({
      level: 'info',
      message: `Creating the service ${this.service}, please wait ...`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('--------------------------------------');
    console.log(`Creating the service ${this.service}, please wait ...`);
    console.log('--------------------------------------');
    this.command = `${this.kubectlConfig} apply -k ${snapshotVersionPath}/active/config/`;
    try {
      this.executionResult = execSync(this.command);
      logCommandWithResult(this.command, this.executionResult);
      await this.logService.create({
        level: 'info',
        message: `${this.command} : ${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
    } catch (error) {
      logCommandWithResult(this.command, error);
      await this.logService.create({
        level: 'error',
        message: `${this.command} : ${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      await this.revertServiceUp();
      throw new InternalServerErrorException(
        `Can't start the service with kubectl`,
      );
    }

    // Check if the service is created properly
    const deployments = await this.getServiceDeployments();
    for (let deployment of deployments) {
      console.log('-------------------------------------------------------');
      console.log(`Checking deployment ${deployment.metadata.name} ...`);
      console.log('-------------------------------------------------------');
      if (!this.isDeploymentAvailable(deployment)) {
        // Wait till the deployment is available
        let timeout = 0;
        const max =
          parseInt(process.env.SERVICE_CREATE_TIMEOUT) /
          parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME);
        let timePassed = 0;
        while (!this.isDeploymentAvailable(deployment) && timeout <= max) {
          await setTimeout(
            parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME) * 1000,
          );
          timePassed += parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME);
          console.log(`${timePassed} seconds have passed ..`);
          deployment = await this.getDeployment(deployment.metadata.name);
          timeout++;
        }
        if (timeout > max) {
          console.log('Create service timeout');
          await this.revertServiceUp();
          throw new RequestTimeoutException('Create service timeout');
        }
      }
    }
  }

  /** Delete a service by executing `kubectl delete -k`
   * @param timestamp (the snapshot) the generated timestamp the moment of the service delete
   * @throws {InternalServerErrorException} when there is no active directory
   */
  private async deleteService(timestamp: string, saveSnapshot: boolean) {
    const snapshotVersionPath = `${process.env.DATA_PATH}/${this.organization_id}/service/${this.service}/${this.product}/${this.version}`;

    // if active directory doesn't exist throw error
    await this.logService.create({
      level: 'info',
      message: `check if active directory exists`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('------------------------------------');
    console.log('check if active directory exists ...');
    console.log('------------------------------------');
    if (!existsSync(`${snapshotVersionPath}/active`)) {
      await this.logService.create({
        level: 'warn',
        message: `Error: Active directory doesn't exist`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      console.log("Error: Active directory doesn't exist");
      throw new InternalServerErrorException(
        'There is no active directory for this service',
      );
    }

    // Delete Service
    await this.deleteServiceAndCheck();

    if (saveSnapshot != false) {
      // Renaming the active folder with the generated timestamp
      console.log('----------------------------------------');
      console.log(
        `Renaming active with generated timestamp (saving snapshot) ..`,
      );
      console.log('----------------------------------------');
      await this.logService.create({
        level: 'info',
        message: `Renaming active with generated timestamp (saving snapshot)`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      this.command = `mv ${snapshotVersionPath}/active ${snapshotVersionPath}/${timestamp}`;
      try {
        this.executionResult = execSync(this.command);
        this.logLevel = 'info';
      } catch (error) {
        this.executionResult = error;
        this.logLevel = 'error';
      }
      await this.logService.create({
        level: this.logLevel,
        message: `${this.command}: ${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      logCommandWithResult(this.command, this.executionResult);
    } else {
      // Deleting the active directory because we don't want to save snapshot
      await this.logService.create({
        level: 'info',
        message: `Deleting active directory (Not saving the snapshot)`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      console.log('----------------------------------------');
      console.log(`Deleting active directory (Not saving the snapshot) ..`);
      console.log('----------------------------------------');
      this.command = `rm -r ${snapshotVersionPath}/active`;
      try {
        this.executionResult = execSync(this.command);
        this.logLevel = 'info';
      } catch (error) {
        this.executionResult = error;
        this.logLevel = 'error';
      }
      await this.logService.create({
        level: this.logLevel,
        message: `${this.command}: ${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      logCommandWithResult(this.command, this.executionResult);
    }
  }

  /**
   * delete the service and the active directory when something went wrong
   */
  private async revertServiceUp() {
    // Delete the active directory
    await this.logService.create({
      level: 'info',
      message: `Something went wrong, deleting the service and active directory`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log(
      '---------------------------------------------------------------',
    );
    console.log(
      'Something went wrong, deleting the service and active directory',
    );
    console.log(
      '---------------------------------------------------------------',
    );
    // Deleting the service
    await this.deleteServiceAndCheck();

    // Delete the active directory
    this.command = `rm -r ${process.env.DATA_PATH}/${this.organization_id}/${this.service}/${this.product}/${this.version}/active`;
    try {
      this.executionResult = execSync(this.command);
      this.logLevel = 'info';
    } catch (error) {
      this.executionResult = error;
      this.logLevel = 'error';
    }
    await this.logService.create({
      level: this.logLevel,
      message: `${this.command}: ${this.executionResult}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    logCommandWithResult(this.command, this.executionResult);
  }

  private async deleteServiceAndCheck() {
    const snapshotVersionPath = `${process.env.DATA_PATH}/${this.organization_id}/service/${this.service}/${this.product}/${this.version}`;

    // Deleting the service from kubernetes
    await this.logService.create({
      level: 'info',
      message: `executing kubectl delete -k to delete ${this.service}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('---------------------------------------------------');
    console.log(`executing kubectl delete -k to delete ${this.service} ...`);
    console.log('---------------------------------------------------');
    this.command = `${this.kubectlConfig} delete -k ${snapshotVersionPath}/active/config/`;
    try {
      this.executionResult = execSync(this.command);
      this.logLevel = 'info';
    } catch (error) {
      this.executionResult = error;
      this.logLevel = 'error';
    }
    await this.logService.create({
      level: this.logLevel,
      message: `${this.command}: ${this.executionResult}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    logCommandWithResult(this.command, this.executionResult);

    // Check if the service is deleted properly
    const deployments = await this.getServiceDeployments();
    for (let deployment of deployments) {
      await this.logService.create({
        level: 'info',
        message: `Checking deploymet ${deployment.metadata.name}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      console.log('-------------------------------------------------------');
      console.log(`Checking deploymet ${deployment.metadata.name} ...`);
      console.log('-------------------------------------------------------');
      if (deployment) {
        let timePassed = 0;
        while (deployment) {
          await setTimeout(
            parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME) * 1000,
          );
          timePassed += parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME);
          console.log(`${timePassed} seconds have passed ..`);
          deployment = await this.getDeployment(deployment.metadata.name);
        }
      }
    }
  }

  /**
   * Create and start a service
   * @param service the service to start.
   * @param product The product we want to start the service with (ex: keyclaok for auth)
   * @param version the version of the service to start.
   * @param snapshot the snapshot to base on to start the service. If it is not defined we are gonna skip the restore process.
   * */
  async upService(
    service: string,
    product: string,
    version: string,
    snapshotTimestamp: string,
    timestamp: number,
    organization: Organization
  ) {
    this.organization = organization;
    this.organization_id = this.organization.organization_id;
    this.service = service;
    this.product = product;
    this.version = version;
    this.setK8s();
    this.setKubectlConfig();
    await this.logService.create({
      level: 'info',
      message: `Starting the service ${this.service}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
      },
    });
    console.log('\x1b[33m%s\x1b[0m', `------------------------------------`);
    console.log(
      '\x1b[33m%s\x1b[0m',
      `Starting the service ${this.service} ...`,
    );
    console.log('\x1b[33m%s\x1b[0m', `------------------------------------`);

    // Check if the service is already running
    const isRunning = await this.isAlreadyRunning(timestamp);

    if (!isRunning) {
      // Check if the database has a snapshot with the same version,
      // if it is restore data otherwise skip the restore
      if (snapshotTimestamp) {
        // if (JSON.parse(process.env.USE_RSYNC.toLowerCase())) {
        // Start The Synchro Pod
        await this.startSynchroPod(snapshotTimestamp);

        // Déployer la clé privé du serveur de stockage ???
        await this.deploySshPrivateKey();

        // Création du dossier de restauration des données
        await this.restoreServiceData(snapshotTimestamp);

        // Stop synchro pod
        await this.stopSynchroPod(snapshotTimestamp);
        // }
      }

      // Set progress after synchroniztion
      await this.serviceService.updateServicesProgress(
        this.organization_id,
        [this.service],
        70,
      );

      // Launch Service
      await this.lunchService(snapshotTimestamp);

      // Set progress after service creation
      await this.serviceService.updateServicesProgress(
        this.organization_id,
        [this.service],
        99,
      );

      console.log('\x1b[32m%s\x1b[0m', `------------------------------------`);
      console.log(
        '\x1b[32m%s\x1b[0m',
        `The service ${this.service} is created successfully`,
      );
      console.log('\x1b[32m%s\x1b[0m', `------------------------------------`);
    } else {
      // throw new BadRequestException('The service is already running');
      throw new ConflictException("'The service is already running'");
    }
  }

  /**  Delete a service
   * @param organization_id id de l'organization
   * @param service the service to delete
   * @param product The product we want to delete the service with (ex: keyclaok for auth)
   * @param version the version of the service to delete
   * @param timestamp (the snapshot) the generated timestamp the moment of the service delete
   * @param snapshot the based on snapshot
   */
  async downService(
    service: string,
    product: string,
    version: string,
    timestamp: string,
    activeSnapshotTimestamp: string | undefined,
    saveSnapshot: boolean,
    organization: Organization
  ) {
    this.organization = organization;
    this.organization_id = this.organization.organization_id;
    this.service = service;
    this.product = product;
    this.version = version;
    this.setK8s();
    this.setKubectlConfig();

    await this.logService.create({
      level: 'info',
      message: `Deleting the service ${this.service}`,
      data: {
        organization_id: this.organization_id,
        context: 'services',
        admin: true,
      },
    });
    console.log('\x1b[33m', `------------------------------------`);
    console.log('\x1b[33m', `Deleting the service ${this.service} ...`);
    console.log('\x1b[33m%s\x1b[0m', `------------------------------------`);

    // Check if the service is already deleted
    const { deploymentsExist, deploymentsReady } =
      await this.isAlreadyDeleted();

    if (deploymentsExist) {
      if (saveSnapshot != false) {
        if (deploymentsReady) {
          saveSnapshot = true;
        } else {
          saveSnapshot = false;
        }
      }
      // Delete Service
      await this.deleteService(`${timestamp}`, saveSnapshot);

      // Set the progress after deleting ths service
      await this.serviceService.updateServicesProgress(
        this.organization_id,
        [service],
        40,
      );

      if (saveSnapshot != false) {
        // if (JSON.parse(process.env.USE_RSYNC.toLowerCase())) {
        // Start synchro pod
        await this.startSynchroPod(`${timestamp}`);

        // Déployer la clé privé du serveur de stockage ???
        await this.deploySshPrivateKey();

        // Sauvegarde les données
        await this.saveServiceData(`${timestamp}`, activeSnapshotTimestamp);

        // stop synchro pod
        await this.stopSynchroPod(`${timestamp}`);
      }

      // Set the progress after the synchronization
      await this.serviceService.updateServicesProgress(
        this.organization_id,
        [service],
        70,
      );

      await this.logService.create({
        level: 'info',
        message: `The service ${this.service} is deleted successfully`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      console.log('\x1b[32m', `------------------------------------`);
      console.log(
        '\x1b[32m',
        `The service ${this.service} is deleted successfully`,
      );
      console.log('\x1b[32m%s\x1b[0m', `------------------------------------`);
    } else {
      // throw new BadRequestException('The service is already Deleted');
      // return true if the service is already deleted
      return true;
    }
  }

  // ---------------------------------------------------------------------------------------
  // ------------------------
  // Jobs
  // ------------------------
  // ---------------------------------------------------------------------------------------

  /**
   * Get a job from the cluster
   * @param jobName name of the job
   * @returns V1Job or undefined
   */
  private async getJob(jobName: string) {
    try {
      const job = await this.k8sApiBatch.readNamespacedJob(
        jobName,
        this.nameSpace,
      );
      if (!job) {
        return undefined;
      }
      return job.body;
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${error.message}`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.RenewSSLId,
          admin: true,
        },
      });
      return undefined;
    }
  }

  /**
   * Delete the job from the cluster and waits till it is deleted
   * @param jobName job name
   */
  private async deleteJob(jobName: string) {
    await this.logService.create({
      level: 'info',
      message: `Deleting the ${jobName} job please wait ..`,
      data: {
        organization_id: this.organization_id,
        connector_id: Configuration.RenewSSLId,
        admin: true,
      },
    });
    console.log('-----------------------------------------------------');
    console.log(`Deleting the ${jobName} job please wait ..`);
    console.log('-----------------------------------------------------');
    await this.k8sApiBatch.deleteNamespacedJob(jobName, this.nameSpace);
    // Checkin if the job is delete
    let job = await this.getJob(jobName);
    let timePassed = 0;
    while (job) {
      await setTimeout(
        parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME) * 1000,
      );
      timePassed += parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME);
      await this.logService.create({
        level: 'info',
        message: `${timePassed} seconds have passed ..`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.RenewSSLId,
          admin: true,
        },
      });
      console.log(`${timePassed} seconds have passed ..`);
      job = await this.getJob(jobName);
    }
    await this.logService.create({
      level: 'info',
      message: `Job ${jobName} is deleted successfully ..`,
      data: {
        organization_id: this.organization_id,
        connector_id: Configuration.RenewSSLId,
        admin: true,
      },
    });
    console.log('--------------------------------------------------');
    console.log(`Job ${jobName} is deleted successfully ..`);
    console.log('--------------------------------------------------');
  }

  /**
   * Check if a given job is completed
   * @param job job name
   * @returns true if the job in completed successfully, flase otherwise
   */
  private isJobCompleted(job: V1Job) {
    if (!job) {
      return false;
    } else {
      if (job.status) {
        if(job.status.conditions) {
          if(job.status.conditions.length > 0) {
            for(const condition of job.status.conditions) {
              if(condition.type == "Complete" && condition.status == "True") {
                return true;
              }
            }
            return false
          } else {
            return false
          }
        } else {
          return false
        }
      } else {
        return false;
      }
    }
  }

  /**
   * Apply a job in the cluster and check if is completed
   * @param jobFile job file name
   * @param sslActiveSnapshotPath the path of the ssl job files
   */
  private async launchSSLJob(jobFile: string, sslActiveSnapshotPath: string) {
    // Apply the job with k8s
    await this.logService.create({
      level: 'info',
      message: `Applying ${jobFile} ...`,
      data: {
        organization_id: this.organization_id,
        connector_id: Configuration.RenewSSLId,
        admin: true,
      },
    });
    console.log('--------------------------------------');
    console.log(`Applying ${jobFile} ...`);
    console.log('--------------------------------------');
    this.command = `${this.kubectlConfig} apply -f ${sslActiveSnapshotPath}/${jobFile}`;
    try {
      this.executionResult = execSync(this.command);
      logCommandWithResult(this.command, this.executionResult);
      await this.logService.create({
        level: 'info',
        message: `${this.command} : ${this.executionResult}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${this.command} : ${error}`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.RenewSSLId,
          admin: true,
        },
      });
      logCommandWithResult(this.command, error);
      throw new InternalServerErrorException(
        `Can't start the job with kubectl`,
      );
    }

    // Check if the job is completed
    const jobName = `${this.organization_id}-frontal-${jobFile.split('.')[0]}`;
    await this.logService.create({
      level: 'info',
      message: `Waiting completion for ${jobName} ...`,
      data: {
        organization_id: this.organization_id,
        connector_id: Configuration.RenewSSLId,
        admin: true,
      },
    });
    console.log('------------------------------------------------');
    console.log(`Waiting completion for ${jobName} ...`);
    console.log('------------------------------------------------');
    const startTime = Date.now();
    let job = await this.getJob(jobName);
    let timePassed = 0;
    while (!this.isJobCompleted(job)) {
      await setTimeout(
        parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME) * 1000,
      );
      timePassed += parseInt(process.env.SERVICE_CHECK_CREATE_WAIT_TIME);
      await this.logService.create({
        level: 'info',
        message: `${timePassed} seconds have passed ..`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.RenewSSLId,
          admin: true,
        },
      });
      console.log(`${timePassed} seconds have passed ..`);

      job = await this.getJob(jobName);

      // Recheck condition and timeout
      if (
        this.isJobCompleted(job) ||
        Date.now() - startTime >=
          parseInt(process.env.JOB_CHECK_COMPLETION_TIMEOUT) * 1000
      ) {
        break;
      }
    }

    if (!this.isJobCompleted(job)) {
      await this.logService.create({
        level: 'warn',
        message: `Job Completion Timeout`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.RenewSSLId,
          admin: true,
        },
      });
      throw new RequestTimeoutException('Job Completion Timeout');
    } else {
      await this.logService.create({
        level: 'info',
        message: `The ${jobName} job is executed successfully ..`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.RenewSSLId,
          admin: true,
        },
      });
      console.log(
        '------------------------------------------------------------',
      );
      console.log(`The ${jobName} job is executed successfully ..`);
      console.log(
        '------------------------------------------------------------',
      );
    }
  }

  /**
   * Launch all the ssl jobs and delete them after
   * @param organization_id orgnisation id
   */
  async launchSSLJobs(organization_id: string) {
    try {
      this.organization_id = organization_id;
      await this.logService.create({
        level: 'info',
        message: `Renewing SSL certificates ...`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.RenewSSLId,
          admin: true,
        },
      });
      console.log('-----------------------------');
      console.log('Renewing SSL certificates ...');
      console.log('-----------------------------');


      const sslActiveSnapshotPath = `${process.env.DATA_PATH}/${this.organization_id}/service/frontal/nginx/v1/active/config/letsencrypt`;

      this.setK8s();
      this.setKubectlConfig();

      // Get the job files
      const jobsFiles = await fsPromises.readdir(sslActiveSnapshotPath);

      for (const jobFile of jobsFiles) {
        await this.logService.create({
          level: 'info',
          message: `Starting the ${jobFile} job ..`,
          data: {
            organization_id: this.organization_id,
            connector_id: Configuration.RenewSSLId,
            admin: true,
          },
        });
        console.log('-----------------------------------------------------');
        console.log(`Starting the ${jobFile} job ..`);
        console.log('-----------------------------------------------------');
        // Execute the job file 3 times before throwing an error
        const jobName = `${this.organization_id}-frontal-${
          jobFile.split('.')[0]
        }`;
        for (let i = 1; i <= 3; i++) {
          await this.logService.create({
            level: 'info',
            message: `${i} try ..`,
            data: {
              organization_id: this.organization_id,
              connector_id: Configuration.RenewSSLId,
              admin: true,
            },
          });
          console.log('-----------');
          console.log(`${i} try ..`);
          console.log('-----------');
          try {
            await this.launchSSLJob(jobFile, sslActiveSnapshotPath);
            break;
          } catch (error) {
            await this.logService.create({
              level: 'error',
              message: `${error}`,
              data: {
                organization_id: this.organization_id,
                connector_id: Configuration.RenewSSLId,
                admin: true,
              },
            });
            console.log(error);

            console.log(
              '-----------------------------------------------------',
            );
            await this.logService.create({
              level: 'info',
              message: `Deleting ${jobName} before the ${i + 1} try ..`,
              data: {
                organization_id: this.organization_id,
                connector_id: Configuration.RenewSSLId,
                admin: true,
              },
            });
            console.log(`Deleting ${jobName} before the ${i + 1} try ..`);
            console.log(
              '-----------------------------------------------------',
            );
            await this.deleteJob(jobName);
            if (i !== 3) {
              continue;
            } else {
              await this.logService.create({
                level: 'info',
                message: `Couldn't execut the ${jobFile}`,
                data: {
                  organization_id: this.organization_id,
                  connector_id: Configuration.RenewSSLId,
                  admin: true,
                },
              });
              throw new InternalServerErrorException(
                `Couldn't execut the ${jobFile}`,
              );
            }
          }
        }

        // Deleting the job after it is executed successfully
        await this.deleteJob(jobName);
      }
      await this.logService.create({
        level: 'info',
        message: `Renew SSL certificates was successful`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.RenewSSLId,
          admin: true,
        },
      });
      console.log('\x1b[32m%s\x1b[0m', `------------------------------------`);
      console.log('\x1b[32m%s\x1b[0m', `Renew SSL certificates was successful`);
      console.log('\x1b[32m%s\x1b[0m', `------------------------------------`);
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${error.message}`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.RenewSSLId,
          admin: true,
        },
      });
      console.log(error);
      if (error.message) {
        throw new InternalServerErrorException(error.message);
      } else {
        throw new InternalServerErrorException(
          'Error while renewing ssl cetificates',
        );
      }
    }
  }
}