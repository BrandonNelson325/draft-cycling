/**
 * Config plugin: raise every Pod target's iOS deployment target to >= 15.1.
 *
 * EAS `image: latest` moved to Xcode 27 (iOS 27.1 SDK), which HARD-ERRORS on
 * any target below iOS 15.0:
 *   "The iOS deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 13.4, but
 *    the range of supported deployment target versions is 15.0 to 27.1.x."
 * Some pods (e.g. RNCAsyncStorage's resource bundle) still declare 13.4. The app
 * itself already targets 15.1 (Expo SDK 52), so raising pods to match changes
 * nothing at runtime.
 *
 * ios/ is gitignored and regenerated on EAS → must be a post_install hook.
 * Idempotent via a marker comment (same pattern as withFmtConstevalFix).
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'withMinPodDeploymentTarget';
const SNIPPET = `
    # --- withMinPodDeploymentTarget: Xcode 27 rejects pod targets below iOS 15 ---
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |bc|
        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('15.1')
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end
    # --- end withMinPodDeploymentTarget ---
`;

module.exports = function withMinPodDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');
      if (contents.includes(MARKER)) return config;

      const anchor = /post_install do \|installer\|/;
      if (!anchor.test(contents)) {
        throw new Error(`${MARKER}: could not find "post_install do |installer|" in the Podfile to patch.`);
      }
      contents = contents.replace(anchor, (m) => `${m}\n${SNIPPET}`);
      fs.writeFileSync(podfile, contents);
      return config;
    },
  ]);
};
