export class OrganizationVersion {
  organization_id: string;
  version_id: string;
  status: number;
  depends_on: string[];
  is_creating: boolean;
  is_deleting: boolean;
  last_run_datetime: Date;
  progress: number;
}
