import { E2EPage, newE2EPage } from '@stencil/core/testing';

describe('effects', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    const errorRef = trackErrors(page);

    await page.setContent('<test-component></test-component>');
    const element = await page.find('test-component');
    expect(element).toHaveClass('hydrated');
    expect(errorRef.current).toEqual([]);
  });

  it('renders correctly', async () => {
    const page = await newE2EPage();
    const errorRef = trackErrors(page);

    await page.setContent('<test-component></test-component>');
    const component = await page.find('test-component > div');
    expect(component.innerHTML).toEqualHtml(`10`);
    expect(errorRef.current).toEqual([]);
  });

  it('runs effects on load and unload', async () => {
    const page = await newE2EPage();
    const errorRef = trackErrors(page);

    await page.setContent('<main><test-component></test-component></main>');

    await expectParentRenderValue(page, 10);
    const running = await page.evaluate(() => window['running']);
    expect(running).toBe(true);
    await page.evaluate(() => {
      let dom = document.querySelector('main');
      dom.innerHTML = 'empty';
    });
    await page.waitForChanges();
    const runningAfter = await page.evaluate(() => window['running']);
    expect(runningAfter).toBe(false);
    expect(errorRef.current).toEqual([]);
  });
});

describe('withHooks lifecycle', () => {
  it('still calls disconnectedCallback after useEffect cleanups', async () => {
    const page = await newE2EPage();
    const errorRef = trackErrors(page);
    await page.setContent('<main><effect-test></effect-test></main>');
    const callsAfterRender = await page.evaluate(() => window['lifecycleCalls'].calls.map(a => a[0]));
    const component = await page.find('effect-test');
    expect(component.innerHTML).toEqualHtml(`<div>true</div>`);

    expect(callsAfterRender).toEqual(['connectedCallback', 'render', 'useEffect']);
    await page.evaluate(() => {
      let dom = document.querySelector('main');
      dom.innerHTML = 'empty';
    });
    const callsAfterCleanp = await page.evaluate(() => window['lifecycleCalls'].calls.map(a => a[0]));
    expect(callsAfterCleanp).toEqual(['connectedCallback', 'render', 'useEffect', 'useEffectCleanup', 'disconnectedCallback']);
    expect(errorRef.current).toEqual([]);
  });
  it('still calls disconnectedCallback without useEffect cleanup', async () => {
    const page = await newE2EPage();
    const errorRef = trackErrors(page);
    await page.setContent('<main><null-lifecycle-test></null-lifecycle-test></main>');
    const callsAfterRender = await page.evaluate(() => window['lifecycleCalls'].calls.map(a => a[0]));
    const component = await page.find('null-lifecycle-test');
    expect(component.innerHTML).toEqualHtml(`<div>true</div>`);

    expect(callsAfterRender).toEqual(['connectedCallback', 'render']);
    await page.evaluate(() => {
      let dom = document.querySelector('main');
      dom.innerHTML = 'empty';
    });
    const callsAfterCleanp = await page.evaluate(() => window['lifecycleCalls'].calls.map(a => a[0]));
    expect(callsAfterCleanp).toEqual(['connectedCallback', 'render', 'disconnectedCallback']);
    expect(errorRef.current).toEqual([]);
  });

  it('lets children run their cleanup tasks', async () => {
    const page = await newE2EPage();
    const errorRef = trackErrors(page);
    await page.setContent('<main><killer-parent></killer-parent></main>');
    const callsAfterRender = await page.evaluate(() => window['lifecycleCalls'].calls.map(a => a[0]));
    // const component = await page.find('null-lifecycle-test');
    // expect(component.innerHTML).toEqualHtml(`<div>true</div>`);

    await page.waitFor(100);
    expect(errorRef.current).toEqual([]);
    expect(callsAfterRender).toEqual([
      // Initial render
      'parent.render.start',
      'parent.render.end',

      // First child render
      'child.render.start',
      'child.render.end',

      // First useEffect, immediately suicide
      'child.useEffect.start',
      'child.useEffect.setState.1',
      'parent.kill',

      // Cleanup runs right away, followed by inner disconnectedCallack
      ...['child.useEffect.cleanup', 'child.disconnectedCallback'],

      'child.useEffect.setState.2',
      'child.useEffect.end',

      // timeout after the event loop finishes (aysnc cleanup)
      'child.useEffect.timeout',
    ]);
  });
});

describe('hooks', () => {
  it('works with useState', async () => {
    await testStateFunction('state-child');
  });
  it('works with useState inside useEffect', async () => {
    const compName = 'state-effect-child';
    const page = await newE2EPage();
    await page.setContent(`<${compName}></${compName}>`);

    await expectParentRenderValue(page, 3, compName);
    await expectRenderMockValue(page, 3);

    const btn = await page.find(`${compName} button`);
    await btn.click();

    await expectParentRenderValue(page, 4, compName);
    await expectLatestRenderMockValue(page, 4);
  });
  it('works with useReducer', async () => {
    await testStateFunction('reducer-child');
  });

  it('works with useDomContextState', async () => {
    await testStateFunction('domstate-child');
  });

  it('works with useMemo', async () => {
    const page = await newE2EPage();
    await page.setContent(`<memo-child></memo-child>`);

    await expectParentRenderValue(page, 233, 'memo-child');
    await expectRenderMockValue(page, 233);
    const btn = await page.find(`memo-child button`);
    await btn.click();

    await expectParentRenderValue(page, 377, 'memo-child');
    await expectRenderMockValue(page, 377);
  });

  it('works with useRef', async () => {
    const page = await newE2EPage();
    await page.setContent(`<ref-child></ref-child>`);

    await expectParentRenderValue(page, 'NONE', 'ref-child');
    await expectRenderMockValue(page, 'NONE');
    const btn = await page.find(`ref-child button`);
    await btn.click();

    await expectParentRenderValue(page, 'Span1', 'ref-child');
    await expectRenderMockValue(page, 'Span1');
  });

  it('works with useCallback', async () => {
    const page = await newE2EPage();

    await page.setContent(`<callbacks-test></callbacks-test>`);
    await page.waitForChanges();

    await (await page.find(`callbacks-test button`)).click();
    await page.waitForChanges();

    await expectCallbackMatch(page, true);

    await (await page.find(`callbacks-test button`)).click();
    await page.waitForChanges();
    await expectCallbackMatch(page, false);
  });
});

describe('stencil-context', () => {
  it('passes context down the dom', async () => {
    const page = await newE2EPage();
    const expectProvided = async val => {
      // Context value should be available on the window
      const provided = await page.evaluate(() => window['provider'].context);
      expect(provided).toBe(val);
    };

    const expectTestChild = async val => expect((await page.find('test-child')).innerHTML).toEqualHtml(`<div>${val}</div>`);

    await page.setContent('<main><test-component><test-child></test-child></test-component></main>');

    /*
     *    Listener should be listening right away
     */
    await expectProvided(10);
    await expectParentRenderValue(page, 10);
    await expectLatestRenderMockValue(page, 10);
    await expectTestChild(10);

    /*
     *   Increment should increment children
     */
    const incr = await page.find('test-component button');
    await incr.click();
    await page.waitForChanges();

    await expectProvided(11);
    await expectParentRenderValue(page, 11);
    await expectLatestRenderMockValue(page, 11);
    await expectTestChild(11);

    /*
     *   Increment should increment children
     */
    await incr.click();
    await page.waitForChanges();

    await expectProvided(12);
    await expectParentRenderValue(page, 12);
    await expectLatestRenderMockValue(page, 12);
    await expectTestChild(12);
  });
});

  it('renders correctly with decorator', async () => {
    const page = await newE2EPage();
    const errorRef = trackErrors(page);

    await page.setContent('<decorated-component-test></decorated-component-test>');
    const component = await page.find('decorated-component-test > div');
    await component.click();
    expect(component.innerHTML).toEqualHtml(`10`);
    expect(errorRef.current).toEqual([]);
  });

  it('fails with missing lifecycle methods', async () => {



  });

function trackErrors(page: E2EPage) {
  const ref = new MutableRef<string[]>([]);
  page.on('pageerror', ({ message }) => (ref.current = [message, ...ref.current]));
  return ref;
}

async function testStateFunction(compName: string) {
  const page = await newE2EPage();
  await page.setContent(`<${compName}></${compName}>`);

  await expectParentRenderValue(page, 3, compName);
  await expectRenderMockValue(page, 3);

  const btn = await page.find(`${compName} button`);
  await btn.click();

  await expectParentRenderValue(page, 4, compName);
  await expectRenderMockValue(page, 4);
}

async function expectCallbackMatch(page: E2EPage, truthy: boolean): Promise<void> {
  const calls = await page.evaluate(() => window['mockCallback'].calls.map(c => c[0]()));

  // Mutates the mock -- internal state is modified here
  const length = calls.length;
  const top = calls[length - 1];
  const nextTop = calls[length - 2];
  if (truthy) {
    expect(top).toStrictEqual(nextTop);
  } else {
    expect(top).not.toStrictEqual(nextTop);
  }
}

async function expectLatestRenderMockValue(page: E2EPage, ...args: unknown[]) {
  const latest = await page.evaluate(() => {
    var latest = window['renderValue'].calls[window['renderValue'].calls.length - 1];
    return latest;
  });
  // Most recent call should match
  expect(latest).toEqual(args);
}

async function expectRenderMockValue(page: E2EPage, ...args: unknown[]) {
  const { latest, earlier } = await page.evaluate(() => {
    // Mutates the mock -- internal state is modified here
    var latest = window['renderValue'].calls.pop();
    var earlier = window['renderValue'].calls;
    return { latest, earlier };
  });
  // Most recent call should match
  expect(latest).toEqual(args);
  // Should not have been any earlier renders
  expect(earlier).toEqual([]);
}

async function expectParentRenderValue(page: E2EPage, val: unknown, name: string = 'test-component') {
  const component = await page.find(name + ' > div');
  expect(component.innerHTML).toEqualHtml(`${val}`);
}

class MutableRef<T> {
  constructor(public current: T) {}
}
