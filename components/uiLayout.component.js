export class UiLayoutComponent extends HTMLElement {

  constructor () {
    super();
    this.attachShadow({mode: 'open'});
    this.currentYear = new Date().getFullYear();
  }

  connectedCallback () {
    this.render();
  }

  render () {
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="/style/style.css" />
      <style>
        .page-title {
          font-weight: normal;
        }
        .logo {
          display: inline-block;
          vertical-align: text-bottom;
          text-indent: -9999px;
          background-image: url('/style/logo.png');
          background-size: 100% 100%;
          height: 2.5em;
          width: calc(2.5em * 2.755);
          margin: 0 0.5em;
        }
        footer { 
          margin-top: var(--mediumSpacing);
        }
      </style>
      
      <h1 class="page-title">
        <a href="/">
          <span class="logo">Fidelis Cybersecurity</span>
          Network Server Configuration
        </a>
      </h1>

      <slot><!--page content goes here--></slot>

      <footer>
        <p>© 2003-${this.currentYear} Fidelis Cybersecurity. All rights reserved.</p>
      </footer>
    `;
  }

}
customElements.define('ui-layout', UiLayoutComponent);
