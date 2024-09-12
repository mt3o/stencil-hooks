import { withHooks } from './stencil-hooks';
import { mockFunction } from './tests/mockFunction';

interface RequiresStencilLifecycleMethods {
    disconnectedCallback(): void;
    connectedCallback(): void;
    render(): any;
}

export function WithStencilHooks(){
return function applyHooks<T extends { new (...args: any): RequiresStencilLifecycleMethods }>(
    constructor: T,
  ) {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        withHooks(this);
        window['lifecycleCalls'] = window['lifecycleCalls'] || mockFunction();
      }

      render() {
        window['lifecycleCalls']('render');
        return super.render();
      }
    }
};
}
