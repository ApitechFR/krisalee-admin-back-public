export interface ServiceWithStatus {
  service_id: string;
  name: string;
  description: string;
  status: number;
  is_creating: boolean;
  is_deleting: boolean;
  depends_on: string[];
}
