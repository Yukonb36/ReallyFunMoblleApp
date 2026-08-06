import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const appJsonPath = path.join(root, 'app.json');
const gradleWrapperPath = path.join(
  root,
  'android',
  'gradle',
  'wrapper',
  'gradle-wrapper.properties'
);
const gradlePropertiesPath = path.join(root, 'android', 'gradle.properties');

const expected = {
  expo: '~57.0.10',
  expoBuildProperties: '57.0.8',
  kotlinVersion: '2.1.20',
  reactNativeGoogleMobileAds: '16.0.3',
  gradleWrapperVersion: '9.3.1',
};

const errors = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function expectEqual(actual, expectedValue, label) {
  if (actual !== expectedValue) {
    errors.push(`${label} must be "${expectedValue}" but is "${actual ?? 'undefined'}".`);
  }
}

const packageJson = readJson(packageJsonPath);
const appJson = readJson(appJsonPath);
const dependencies = packageJson.dependencies ?? {};

expectEqual(dependencies.expo, expected.expo, 'package.json dependencies.expo');
expectEqual(
  dependencies['expo-build-properties'],
  expected.expoBuildProperties,
  'package.json dependencies.expo-build-properties'
);
expectEqual(
  dependencies['react-native-google-mobile-ads'],
  expected.reactNativeGoogleMobileAds,
  'package.json dependencies.react-native-google-mobile-ads'
);

if (appJson?.expo?.android?.kotlinVersion) {
  errors.push(
    'app.json expo.android.kotlinVersion is deprecated for this project. Use expo-build-properties plugin android.kotlinVersion only.'
  );
}

const plugins = appJson?.expo?.plugins ?? [];
const buildPropertiesPlugin = plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
);

if (!buildPropertiesPlugin || !Array.isArray(buildPropertiesPlugin)) {
  errors.push('app.json must include the expo-build-properties plugin.');
} else {
  const kotlinVersion = buildPropertiesPlugin?.[1]?.android?.kotlinVersion;
  expectEqual(
    kotlinVersion,
    expected.kotlinVersion,
    'app.json expo-build-properties android.kotlinVersion'
  );
}

if (fs.existsSync(gradleWrapperPath)) {
  const wrapper = fs.readFileSync(gradleWrapperPath, 'utf8');
  if (!wrapper.includes(`gradle-${expected.gradleWrapperVersion}-`)) {
    errors.push(
      `android gradle wrapper must use Gradle ${expected.gradleWrapperVersion}. Check ${path.relative(root, gradleWrapperPath)}.`
    );
  }
}

if (fs.existsSync(gradlePropertiesPath)) {
  const gradleProperties = fs.readFileSync(gradlePropertiesPath, 'utf8');
  if (!gradleProperties.includes(`android.kotlinVersion=${expected.kotlinVersion}`)) {
    errors.push(
      `android.kotlinVersion must be ${expected.kotlinVersion} in ${path.relative(root, gradlePropertiesPath)}.`
    );
  }
}

if (errors.length > 0) {
  console.error('Android toolchain preflight validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Android toolchain preflight validation passed.');
