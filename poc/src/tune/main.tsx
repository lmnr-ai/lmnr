import {lazy, StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import 'dialkit/styles.css';
import '../styles.css';
import '../experiments/experiment-picker.css';
import '../experiments/micro-01/styles.css';
import '../experiments/micro-02/styles.css';
import '../experiments/micro-03/styles.css';
import '../experiments/micro-04/styles.css';
import '../experiments/micro-05/styles.css';
import '../experiments/micro-06/styles.css';
import '../experiments/micro-07/styles.css';
import '../experiments/micro-08/styles.css';
import '../experiments/micro-09/styles.css';
import '../experiments/micro-10/styles.css';
import '../experiments/micro-11/styles.css';
import '../experiments/micro-12/styles.css';
import '../experiments/micro-14/styles.css';
import '../experiments/micro-15/styles.css';
import '../experiments/micro-16/styles.css';
import '../experiments/micro-17/styles.css';
import '../experiments/micro-18/styles.css';
import '../experiments/micro-20/styles.css';
import '../experiments/introducing-flow-1/styles.css';
import {App} from './App';
import {MicroAnimationApp} from '../experiments/micro-01/App';
import {EmptyAnimationApp} from '../experiments/micro-02/App';
import {Micro03App} from '../experiments/micro-03/App';
import {Micro04App} from '../experiments/micro-04/App';
import {Micro05App} from '../experiments/micro-05/App';
import {Micro06App} from '../experiments/micro-06/App';
import {Micro07App} from '../experiments/micro-07/App';
import {Micro08App} from '../experiments/micro-08/App';
import {Micro09App} from '../experiments/micro-09/App';
import {Micro10App} from '../experiments/micro-10/App';
import {Micro11App} from '../experiments/micro-11/App';
import {Micro12App} from '../experiments/micro-12/App';
import {Micro14App} from '../experiments/micro-14/App';
// Micro15's entry migrates its storage on import; do not run that migration on other editions.
const Micro15App=lazy(()=>import('../experiments/micro-15/App').then(module=>({default:module.Micro15App})));
import {Micro16App} from '../experiments/micro-16/App';
import {Micro17App} from '../experiments/micro-17/App';
import {Micro18App} from '../experiments/micro-18/App';
import {Micro20App} from '../experiments/micro-20/App';
import {Ultimate3SilkApp} from '../experiments/ultimate-3-silk/App';
import {IntroducingFlow1App} from '../experiments/introducing-flow-1/App';

const experiment = new URLSearchParams(window.location.search).get('experiment');
const content = experiment === 'micro-01'
  ? <MicroAnimationApp />
  : experiment === 'micro-02'
    ? <EmptyAnimationApp />
    : experiment === 'micro-03'
      ? <Micro03App />
      : experiment === 'micro-04'
        ? <Micro04App />
        : experiment === 'micro-05'
          ? <Micro05App />
          : experiment === 'micro-06'
            ? <Micro06App />
            : experiment === 'micro-07'
              ? <Micro07App />
              : experiment === 'micro-08'
                ? <Micro08App />
                : experiment === 'micro-09'
                  ? <Micro09App />
                  : experiment === 'micro-10'
                    ? <Micro10App />
                    : experiment === 'micro-11'
                      ? <Micro11App />
                      : experiment === 'micro-12'
                        ? <Micro12App />
                        : experiment === 'micro-14'
                          ? <Micro14App />
                          : experiment === 'micro-15'
                            ? <Suspense fallback={<p role="status">Loading Issue clusters authoring…</p>}><Micro15App /></Suspense>
                            : experiment === 'micro-16'
                              ? <Micro16App />
                              : experiment === 'micro-17'
                                ? <Micro17App />
                              : experiment === 'micro-20'
                                ? <Micro20App />
                              : experiment === 'ultimate-3-silk'
                                ? <Ultimate3SilkApp />
                              : experiment === 'micro-18'
                                ? <Micro18App />
                              : experiment === 'introducing-flow-1'
                                ? <IntroducingFlow1App />
                                : <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>{content}</StrictMode>,
);
