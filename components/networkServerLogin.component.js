import {serverConfigService} from '../services/serverConfig.service.js';

export class NetworkServerLoginComponent extends HTMLElement {

  constructor () {
    super();
    this.attachShadow({mode: 'open'});
  }

  connectedCallback () {
    this.loginInfo = {};
    this.render();
  }

  formToObj (formData) {
    this.loginInfo = this.loginInfo || {};
    this.loginInfo.username = formData['username'].value;
    this.loginInfo.password = formData['password'].value;
    return this.loginInfo;
  }

  login (data) {
    this.loginError = '';
    this.render();
    let p = serverConfigService.login(data)
      .then(() => {
        this.loginError = /*error.error ||*/ 'Wrong credentials';
        this.render();

      })
      .catch(error => {
        this.loginError = /*error.error ||*/ 'Wrong credentials';
        this.render();
      });
    return p;
  }

  attachEvents () {
    let loginForm = this.shadowRoot.querySelector('#loginForm');
    loginForm.addEventListener('submit', e => {
      this.login(this.formToObj(loginForm.elements));
      e.preventDefault();
    });
  }

  render () {
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="/style/style.css" />
      <form id="loginForm">
        <table>
          <tr>
            <th><label for="login-username">Username:</label></th>
            <td><input id="login-username" name="username" type="text" value="${this.loginInfo.username||''}" required /></td>
          </tr>
          <tr>
            <th><label for="login-password">Password:</label></th>
            <td><input id="login-password" name="password" type="password" value="${this.loginInfo.password||''}" required /></td>
          </tr>
        </table>
        <p>
          <button type="submit">✔ Login</button>
          <b class="important" id="login-error">${this.loginError||''}</b>
        </p>
      </form>
    `;
    this.attachEvents();
  }

}
customElements.define('network-server-login', NetworkServerLoginComponent);
