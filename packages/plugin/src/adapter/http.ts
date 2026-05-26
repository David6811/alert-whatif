import { getBackendSrv, type BackendSrvRequest } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';

export function api<T>(options: BackendSrvRequest): Promise<T> {
  return lastValueFrom(getBackendSrv().fetch<T>(options)).then((r) => r.data);
}
