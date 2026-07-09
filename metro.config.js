const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Get the project root
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Add the 'ride_booking_server' directory to the block list.
config.resolver.blacklistRE = [
  ...Array.isArray(config.resolver.blacklistRE) ? config.resolver.blacklistRE : [],
  new RegExp(path.resolve(projectRoot, 'ride_booking_server').replace(/\\/g, '\\\\') + '\\/.*'),
];

module.exports = config; 