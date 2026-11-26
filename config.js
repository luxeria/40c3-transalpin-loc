// Settings for the Transalpin VAN-Transport-Protocol page.
// Edit this file to adapt the tool - no build step needed.

const CONFIG = {
  // Shown in the label header.
  event: '40C3',

  // Where the transport sheets are collected (CC of the backup mail).
  collectorMail: 'info@luxeria.ch',

  // Suggestions for the "Assembly" field. Free text is always allowed.
  // TODO: replace with the real list of Transalpin assemblies.
  assemblies: [
    'Luxeria',
    'Bitwäscherei',
    'CCC Zürich',
    'Chaostreff Bern',
    'Coredump',
    'FIXME',
    'Ruum42',
  ],

  // Handling flags offered as checkboxes in the "Options" section.
  flags: [
    'FRAGILE',
    'THIS SIDE UP',
    'DO NOT STACK',
    'KEEP DRY',
    'HEAVY - 2 PERSONS',
  ],
};
