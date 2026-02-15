// Hash-based SPA Router

class Router {
  constructor() {
    this._routes = [];
    this._currentView = null;
    this._onNavigate = null;
    window.addEventListener('hashchange', () => this._resolve());
    window.addEventListener('popstate', () => this._resolve());
  }

  on(pattern, handler) {
    // Convert route pattern to regex: #/event/:id → /^#\/event\/([^/]+)$/
    const paramNames = [];
    const regexStr = pattern
      .replace(/:[a-zA-Z]+/g, (match) => {
        paramNames.push(match.slice(1));
        return '([^/]+)';
      })
      .replace(/\//g, '\\/');
    this._routes.push({
      pattern,
      regex: new RegExp(`^${regexStr}$`),
      paramNames,
      handler
    });
    return this;
  }

  onNavigate(callback) {
    this._onNavigate = callback;
  }

  navigate(hash) {
    if (!hash.startsWith('#')) hash = '#' + hash;
    window.location.hash = hash;
  }

  back() {
    window.history.back();
  }

  start() {
    if (!window.location.hash) {
      window.location.hash = '#/';
    }
    this._resolve();
  }

  getCurrentHash() {
    return window.location.hash || '#/';
  }

  _resolve() {
    const hash = this.getCurrentHash();
    for (const route of this._routes) {
      const match = hash.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1]);
        });
        if (this._onNavigate) this._onNavigate(route.pattern, params);
        route.handler(params);
        return;
      }
    }
    // Default: redirect to home
    this.navigate('#/');
  }
}

export const router = new Router();
