<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { curves, frame, SIZE, type Plate } from './curves';

  // A textbook-style figure that draws one curve from the library, and draws
  // the next on request. The first curve is server-rendered and drawn in by
  // CSS alone, so the plate looks the same before (or without) hydration.

  const plates = new Map<number, Plate>();
  function plate(index: number): Plate {
    if (!plates.has(index)) plates.set(index, frame(curves[index]));
    return plates.get(index)!;
  }

  // Graph-paper rules: minor every 20 units, major every 100.
  const ticks = Array.from({ length: SIZE / 20 - 1 }, (_, i) => (i + 1) * 20);
  const gridPath = (keep: (v: number) => boolean) =>
    ticks.filter(keep).map((v) => `M${v} 0V${SIZE}M0 ${v}H${SIZE}`).join('');
  const minorGrid = gridPath((v) => v % 100 !== 0);
  const majorGrid = gridPath((v) => v % 100 === 0);

  // Curves alternate between the resources and tuition accents.
  const accent = (index: number) => (index % 2 === 0 ? 'rgb(var(--resources))' : 'rgb(var(--tuition))');
  const pad = (n: number) => String(n).padStart(2, '0');

  let current = $state(0);
  let serial = 0;
  let drawn = $state([{ id: 0, index: 0 }]);
  const curve = $derived(curves[current]);

  function next() {
    current = (current + 1) % curves.length;
    drawn = [{ id: ++serial, index: current }];
  }

  // The island hydrates once the plate scrolls into view (client:visible). On
  // small screens that is long after the CSS draw-in finished, so draw the
  // figure again for the reader who has just reached it.
  onMount(() => {
    if (performance.now() > 4000 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawn = [{ id: ++serial, index: current }];
    }
  });
</script>

<figure class="plate">
  <div class="plate-frame">
    <svg viewBox="0 0 {SIZE} {SIZE}" role="img" aria-labelledby="plate-caption">
      <path class="grid grid--minor" d={minorGrid} />
      <path class="grid grid--major" d={majorGrid} />
      {#each drawn as item (item.id)}
        {@const p = plate(item.index)}
        <g style:--pen={accent(item.index)} out:fade={{ duration: 450 }}>
          {#if p.xAxis !== null}<path class="grid grid--axes" d="M0 {p.xAxis}H{SIZE}" />{/if}
          {#if p.yAxis !== null}<path class="grid grid--axes" d="M{p.yAxis} 0V{SIZE}" />{/if}
          <path class="curve" d={p.path} pathLength="1" style:stroke-width={curves[item.index].weight ?? 1.6} />
          {#each p.dots as [cx, cy]}
            <circle class="dot" {cx} {cy} r="4.5" />
          {/each}
        </g>
      {/each}
    </svg>
    <span class="plate-corner" aria-hidden="true">{pad(current + 1)} / {pad(curves.length)}</span>
  </div>
  <figcaption class="plate-foot">
    <span id="plate-caption" class="plate-caption" aria-live="polite">
      <span class="plate-name"><span class="plate-fig">Fig. {current + 1}</span> {curve.name}</span>
      <span class="plate-equation">
        {#each curve.lines as line}<span>{@html line}</span>{' '}{/each}
      </span>
      {#if curve.note}<span class="plate-note">{curve.note}</span>{/if}
    </span>
    <button type="button" class="plate-next" onclick={next}>
      <span>Draw another</span>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
      </svg>
    </button>
  </figcaption>
</figure>

<style>
  .plate { margin: 0; width: 100%; }
  .plate-frame {
    position: relative;
    aspect-ratio: 1;
    background: rgb(var(--surface-raised));
    border: 1px solid rgb(var(--rule));
    box-shadow: 0 1px 0 rgb(var(--rule) / .6), 0 24px 48px -32px rgb(var(--ink) / .28);
  }
  svg { display: block; width: 100%; height: 100%; }
  .grid { fill: none; vector-effect: non-scaling-stroke; shape-rendering: crispEdges; }
  .grid--minor { stroke: rgb(var(--rule) / .55); stroke-width: 1; }
  .grid--major { stroke: rgb(var(--rule)); stroke-width: 1; }
  .grid--axes { stroke: rgb(var(--rule-strong)); stroke-width: 1; }
  .curve {
    fill: none;
    stroke: var(--pen);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1 1;
    animation: draw 3.2s cubic-bezier(.6, 0, .3, 1) both;
  }
  @keyframes draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
  /* Marked points land once the curve has been drawn through them. */
  .dot {
    fill: var(--pen);
    stroke: rgb(var(--surface-raised));
    stroke-width: 1.5;
    transform-box: fill-box;
    transform-origin: center;
    animation: land .35s cubic-bezier(.3, 1.6, .6, 1) 3s both;
  }
  @keyframes land { from { transform: scale(0); } to { transform: scale(1); } }
  .plate-corner {
    position: absolute;
    top: 10px;
    right: 12px;
    color: rgb(var(--muted));
    font-size: 11px;
    letter-spacing: .12em;
    font-variant-numeric: tabular-nums;
  }

  /* The button drops below the caption when there is no room beside it. */
  .plate-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px 20px;
    padding-top: 14px;
  }
  .plate-caption { flex: 1 1 210px; min-width: 0; font-family: Georgia, Cambria, serif; line-height: 1.45; }
  .plate-name { display: block; color: rgb(var(--ink)); font-size: 15px; }
  .plate-fig {
    margin-right: 6px;
    color: rgb(var(--muted));
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .plate-equation { display: block; color: rgb(var(--muted)); font-size: 14px; }
  .plate-equation > span { white-space: nowrap; }
  .plate-equation :global(i) { font-style: italic; }
  .plate-note { display: block; margin-top: 2px; color: rgb(var(--muted)); font-family: Arial, Helvetica, sans-serif; font-size: 12px; }

  .plate-next {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    gap: 8px;
    min-height: 36px;
    padding: 6px 12px;
    border: 1px solid rgb(var(--rule-strong));
    border-radius: 2px;
    background: transparent;
    color: rgb(var(--ink));
    font-size: 13px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .plate-next svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: transform .45s cubic-bezier(.3, 1.4, .6, 1); }
  .plate-next:active svg { transform: rotate(120deg); }
  @media (hover: hover) {
    .plate-next:hover { background: rgb(var(--surface-overlay)); }
    .plate-next:hover svg { transform: rotate(90deg); }
  }
  @media (pointer: coarse) {
    .plate-next { min-height: 44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .curve, .dot { animation: none; }
  }
</style>
