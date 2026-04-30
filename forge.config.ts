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

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: [iconFilePath],
    icon: iconBasePath,
    executableName: 'LegisDex',
    appBundleId,
    appCategoryType: 'public.app-category.business',
    darwinDarkModeSupport: true,
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
      name: 'legisdex',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDMG(
      {
        format: 'ULFO',
      },
      ['darwin'],
    ),
    new MakerRpm({
      options: {
        productName: 'LegisDex',
        genericName: 'Legal research desktop app',
        icon: linuxIconPath,
        categories: ['Office'],
      },
    }),
    new MakerDeb({
      options: {
        productName: 'LegisDex',
        icon: linuxIconPath,
        categories: ['Office'],
        maintainer: 'Dilukshan <65407969+dilukshann7@users.noreply.github.com>',
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
