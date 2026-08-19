(() => {
  'use strict';
  Promise.all([
    import('./ui-polish-core.js?v=UI_KPI_ICON_1'),
    import('./registration-gate.js?v=AUTH_REGISTRATION_V4'),
    import('./gantt-execution-tooltip.js?v=GANTT_EXECUTION_TOOLTIP_1')
  ]).catch((error) => console.error('Cannot load UI extensions', error));
})();
