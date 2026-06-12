const { withModuleFederationPlugin } = require('@angular-architects/module-federation/webpack');

module.exports = withModuleFederationPlugin({
  name: 'frontend',

  exposes: {},

  shared: {
    '@angular/core': { singleton: true, strictVersion: false, requiredVersion: 'auto' },
    '@angular/common': { singleton: true, strictVersion: false, requiredVersion: 'auto' },
    '@angular/router': { singleton: true, strictVersion: false, requiredVersion: 'auto' },

    '@platform/ui-kit': {
      singleton: true,
      strictVersion: false,
      requiredVersion: false,
    },
  },
});
