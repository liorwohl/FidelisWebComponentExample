import {rest} from '../services/rest.service.js';

class ServerConfigService {

  login (data) {
    let p = rest.post('/network/ui/management/login', data);
    return p;
  }

}
export const serverConfigService = new ServerConfigService();