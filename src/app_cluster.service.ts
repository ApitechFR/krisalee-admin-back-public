// @ts-nocheck
import * as cluster from 'cluster';
import * as os from 'os';
import { Injectable } from '@nestjs/common';

const numCPUs = os.cpus().length;

@Injectable()
export class AppClusterService {
  static clusterize(callback: Function): void {
    if (cluster.isPrimary) {
      for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
      }
      cluster.on('exit', (worker, code, signal) => {
        cluster.fork();
      });
    } else {
      callback();
    }
  }
}
