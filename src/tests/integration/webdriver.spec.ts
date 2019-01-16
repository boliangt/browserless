import { BrowserlessServer } from '../../browserless-web-server';
import { sleep } from '../../utils';

import {
  defaultParams,
  getChromeProcesses,
  killChrome,
  throws,
  webdriverOpts,
} from './utils';

const webdriver = require('selenium-webdriver');

describe('Browserless Chrome Webdriver', () => {
  let browserless: BrowserlessServer;
  const start = (args) => browserless = new BrowserlessServer(args);

  afterEach(async () => {
    await browserless.kill();

    return killChrome();
  });

  it('runs concurrently', async () => {
    const params = defaultParams();
    const chromeCapabilities = webdriver.Capabilities.chrome();
    const browserless = start({
      ...params,
      maxConcurrentSessions: 2,
    });

    await browserless.startServer();
    chromeCapabilities.set('chromeOptions', webdriverOpts);

    async function run() {
      const driver = new webdriver.Builder()
        .forBrowser('chrome')
        .withCapabilities(chromeCapabilities)
        .usingServer(`http://localhost:${params.port}/webdriver`)
        .build();

      await driver.get('https://example.com');
      await driver.quit();
    }

    await Promise.all([ run(), run() ]);
    await sleep(50);

    expect(browserless.currentStat.successful).toEqual(2);
    expect(browserless.currentStat.rejected).toEqual(0);
    expect(browserless.currentStat.queued).toEqual(0);
  });

  it('works with no timeouts', async () => {
    const params = defaultParams();
    const chromeCapabilities = webdriver.Capabilities.chrome();
    const browserless = start({
      ...params,
      connectionTimeout: -1,
    });

    await browserless.startServer();
    chromeCapabilities.set('chromeOptions', webdriverOpts);

    async function run() {
      const driver = new webdriver.Builder()
        .forBrowser('chrome')
        .withCapabilities(chromeCapabilities)
        .usingServer(`http://localhost:${params.port}/webdriver`)
        .build();

      await driver.get('https://example.com');
      await driver.quit();
    }

    await run();
    await sleep(50);

    expect(browserless.currentStat.timedout).toEqual(0);
    expect(browserless.currentStat.successful).toEqual(1);
    expect(browserless.currentStat.rejected).toEqual(0);
    expect(browserless.currentStat.queued).toEqual(0);
  });

  it('authorizes with tokens', async () => {
    const params = defaultParams();
    const chromeCapabilities = webdriver.Capabilities.chrome();
    const browserless = start({
      ...params,
      token: 'abcd',
    });

    await browserless.startServer();
    chromeCapabilities.set('chromeOptions', webdriverOpts);

    async function run() {
      const driver = new webdriver.Builder()
        .forBrowser('chrome')
        .withCapabilities(chromeCapabilities)
        .usingServer(`http://abcd@localhost:${params.port}/webdriver`)
        .build();

      await driver.get('https://example.com');
      await driver.quit();
    }

    await run();
    await sleep(50);

    expect(browserless.currentStat.successful).toEqual(1);
    expect(browserless.currentStat.rejected).toEqual(0);
    expect(browserless.currentStat.queued).toEqual(0);
  });

  it('queues sessions', async () => {
    const params = defaultParams();
    const chromeCapabilities = webdriver.Capabilities.chrome();
    const browserless = start(params);

    await browserless.startServer();
    chromeCapabilities.set('chromeOptions', webdriverOpts);

    async function run() {
      const driver = new webdriver.Builder()
        .forBrowser('chrome')
        .withCapabilities(chromeCapabilities)
        .usingServer(`http://localhost:${params.port}/webdriver`)
        .build();

      await driver.get('https://example.com');
      await driver.quit();
    }

    await Promise.all([ run(), run() ]);
    await sleep();

    expect(browserless.currentStat.successful).toEqual(2);
    expect(browserless.currentStat.queued).toEqual(1);
  });

  it('fails requests', async () => {
    const params = defaultParams();
    const browserless = start({
      ...params,
      maxConcurrentSessions: 0,
      maxQueueLength: 0,
    });

    await browserless.startServer();
    const chromeCapabilities = webdriver.Capabilities.chrome();
    chromeCapabilities.set('chromeOptions', webdriverOpts);

    return new webdriver.Builder()
      .forBrowser('chrome')
      .withCapabilities(chromeCapabilities)
      .usingServer(`http://localhost:${params.port}/webdriver`)
      .build()
      .then(throws)
      .catch((error) => {
        expect(error.message).toEqual('Unable to parse new session response: ');
      });
  });

  it('fails requests without tokens', async () => {
    const params = defaultParams();
    const browserless = start({
      ...params,
      token: 'abc',
    });

    await browserless.startServer();
    const chromeCapabilities = webdriver.Capabilities.chrome();
    chromeCapabilities.set('chromeOptions', webdriverOpts);

    return new webdriver.Builder()
      .forBrowser('chrome')
      .withCapabilities(chromeCapabilities)
      .usingServer(`http://localhost:${params.port}/webdriver`)
      .build()
      .then(throws)
      .catch((error) => {
        expect(error.message).toEqual('Unauthorized');
      });
  });

  it('closes chrome when the session is closed', async () => {
    const params = defaultParams();
    const chromeCapabilities = webdriver.Capabilities.chrome();
    const browserless = start({
      ...params,
      maxConcurrentSessions: 2,
    });

    await browserless.startServer();
    chromeCapabilities.set('chromeOptions', webdriverOpts);

    const driver = new webdriver.Builder()
      .forBrowser('chrome')
      .withCapabilities(chromeCapabilities)
      .usingServer(`http://localhost:${params.port}/webdriver`)
      .build();

    await driver.get('https://example.com');
    await driver.quit();

    await sleep(50);

    expect(browserless.currentStat.successful).toEqual(1);
    expect(browserless.currentStat.rejected).toEqual(0);
    expect(browserless.currentStat.queued).toEqual(0);
    const processes = await getChromeProcesses();

    await sleep(50);

    expect(processes.stdout).not.toContain('.local-chromium');
  });
});
