import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'node:path';

const publicDir = path.resolve(process.cwd(), 'public');
const iconBasePath = path.resolve(publicDir, 'favicon');
const iconFilePath = path.resolve(process.cwd(), 'public', 'favicon.ico');
const linuxIconPath = path.resolve(publicDir, 'logo-small.png');
const appBundleId = 'com.legisdex.desktop';
const windowsCertificateFile = process.env.WINDOWS_CERTIFICATE_FILE?.trim();
const windowsCertificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD?.trim();
const appleSigningIdentity = process.env.APPLE_SIGNING_IDENTITY?.trim();
const appleKeychain = process.env.APPLE_KEYCHAIN?.trim();
const appleId = process.env.APPLE_ID?.trim();
const appleAppSpecificPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD?.trim();
const appleTeamId = process.env.APPLE_TEAM_ID?.trim();

const windowsSign =
  windowsCertificateFile && windowsCertificatePassword
    ? {
        certificateFile: windowsCertificateFile,
        certificatePassword: windowsCertificatePassword,
        description: 'LegisDex desktop shell',
        website: 'https://www.legisdex.com',
      }
    : undefined;

const osxSign = appleSigningIdentity
  ? {
      identity: appleSigningIdentity,
      ...(appleKeychain ? { keychain: appleKeychain } : {}),
    }
  : undefined;

const osxNotarize =
  appleId && appleAppSpecificPassword && appleTeamId
    ? {
        appleId,
        appleIdPassword: appleAppSpecificPassword,
        teamId: appleTeamId,
      }
    : undefined;

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: [iconFilePath],
    icon: iconBasePath,
    executableName: 'LegisDex',
    appBundleId,
    appCategoryType: 'public.app-category.business',
    darwinDarkModeSupport: true,
    ...(osxSign ? { osxSign } : {}),
    ...(osxNotarize ? { osxNotarize } : {}),
    ...(windowsSign ? { windowsSign } : {}),
    protocols: [
      {
        name: 'LegisDex Auth',
        schemes: ['legisdex'],
      },
    ],
    win32metadata: {
      CompanyName: 'LegisDex',
      FileDescription: 'LegisDex desktop shell',
      OriginalFilename: 'LegisDex.exe',
      ProductName: 'LegisDex',
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupIcon: iconFilePath,
      iconUrl: 'https://www.legisdex.com/favicon.ico',
      name: 'legisdex',
      setupExe: 'LegisDexSetup.exe',
      ...(windowsSign ? { windowsSign } : {}),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDMG(
      {
        format: 'ULFO',
        ...(appleSigningIdentity
          ? {
              'code-sign': {
                'signing-identity': appleSigningIdentity,
                identifier: appBundleId,
              },
            }
          : {}),
      },
      ['darwin'],
    ),
    new MakerRpm({
      options: {
        bin: 'LegisDex',
        productName: 'LegisDex',
        genericName: 'Legal research desktop app',
        icon: linuxIconPath,
        categories: ['Office'],
      },
    }),
    new MakerDeb({
      options: {
        bin: 'LegisDex',
        productName: 'LegisDex',
        icon: linuxIconPath,
        categories: ['Office'],
        maintainer: 'LegisDex <info@legisdex.com>',
        homepage: 'https://www.legisdex.com',
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/topbar-preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
