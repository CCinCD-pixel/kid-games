import { defineConfig } from '@playwright/test';
import base from '../../../tests/smoke/playwright.config';
export default defineConfig({
  ...base, testDir:'.',testMatch:'station.spec.ts',
  projects:[
    ...base.projects!,
    {name:'phone-390x664',use:{viewport:{width:390,height:664},isMobile:true,hasTouch:true,deviceScaleFactor:2}},
    {name:'phone-320x568',use:{viewport:{width:320,height:568},isMobile:true,hasTouch:true,deviceScaleFactor:2}},
    {name:'phone-844x390',use:{viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2}},
  ],
});
