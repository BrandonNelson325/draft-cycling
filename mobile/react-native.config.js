// Apple Health (and its Nitro runtime) are iOS-only. Nitro 0.35's Android code
// targets a newer React Native than 0.76 and fails to compile, so don't link
// either package on Android.
module.exports = {
  dependencies: {
    '@kingstinct/react-native-healthkit': { platforms: { android: null } },
    'react-native-nitro-modules': { platforms: { android: null } },
  },
};
