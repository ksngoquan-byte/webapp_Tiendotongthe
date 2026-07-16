(() => {
  'use strict';
  Promise.all([
    import('./ui-polish-core.js?v=UI_KPI_ICON_1'),
    import('./registration-gate.js?v=AUTH_REGISTRATION_V4')
  ]).catch((error) => console.error('Cannot load UI extensions', error));
})();
