import { css, keyframes } from '@emotion/css';

const reduceSweep = keyframes`
  0%   { opacity: 0; transform: scale(0); }
  30%  { opacity: 1; transform: scale(2.5); }
  100% { opacity: 1; transform: scale(1.2); }
`;

const reduceFlash = keyframes`
  0%   { opacity: 1; transform: scale(1.2); }
  50%  { opacity: 1; transform: scale(2.5); }
  100% { opacity: 1; transform: scale(1.2); }
`;

const reduceFade = keyframes`
  0%   { opacity: 1; transform: scale(1.2); }
  100% { opacity: 0; transform: scale(0); }
`;

const reducePop = keyframes`
  0%   { opacity: 0; transform: scale(0); }
  40%  { opacity: 1; transform: scale(3.5); }
  100% { opacity: 0.85; transform: scale(1.2); }
`;

const reduceOutputFlash = keyframes`
  0%   { color: inherit; background: transparent; }
  10%  { color: #1a1a1a; background: var(--event-pending); }
  60%  { color: #1a1a1a; background: var(--event-pending); }
  100% { color: inherit; background: transparent; }
`;

const nowPollPop = keyframes`
  0%   { transform: scale(1.6); filter: brightness(1.6); }
  60%  { transform: scale(1);   filter: brightness(1); }
  100% { transform: scale(1);   filter: brightness(1); }
`;

const nowBreath = keyframes`
  0%, 100% { transform: scale(1);    opacity: 0.95; }
  50%      { transform: scale(1.12); opacity: 1; }
`;

export const animationScope = css`
  & .reduce-sample-dot {
    position: absolute;
    width: 6px;
    height: 6px;
    margin-left: -3px;
    margin-top: -3px;
    border-radius: 50%;
    background: var(--event-pending);
    box-shadow: 0 0 4px var(--event-pending);
    opacity: 0;
    pointer-events: none;
    animation:
      ${reduceSweep} 500ms ease-out forwards,
      ${reduceFlash} 500ms ease-in-out forwards,
      ${reduceFade} 400ms ease-out forwards;
  }

  & .reduce-result-dot {
    position: absolute;
    width: 6px;
    height: 6px;
    margin-left: -3px;
    margin-top: -3px;
    border-radius: 50%;
    background: var(--event-pending);
    box-shadow: 0 0 8px var(--event-pending);
    opacity: 0;
    pointer-events: none;
    animation: ${reducePop} 1200ms ease-out forwards;
  }

  & .reduce-output-flash {
    display: inline-block;
    animation: ${reduceOutputFlash} 700ms ease-out both;
  }

  & .alert-whatif-now-clock-pop {
    display: inline-block;
    transform-origin: 50% 50%;
    animation: ${nowPollPop} 900ms ease-out;
  }

  & .alert-whatif-now-clock-breath {
    display: inline-block;
    transform-origin: 50% 50%;
    animation: ${nowBreath} 2s ease-in-out infinite;
  }
`;
