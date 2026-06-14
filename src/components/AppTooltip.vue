<script setup lang="ts">
import { nextTick, onBeforeUnmount, reactive, ref } from "vue";

const props = withDefaults(defineProps<{
  text: string;
  disabled?: boolean;
  triggerClass?: string;
}>(), {
  disabled: false,
  triggerClass: "",
});

const triggerRef = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);
const visible = ref(false);
const position = reactive({
  top: 0,
  left: 0,
  width: 0,
});

function updatePosition(): void {
  const trigger = triggerRef.value;
  const tooltip = tooltipRef.value;
  if (!trigger || !tooltip) {
    return;
  }

  const gap = 8;
  const viewportPadding = 12;
  const rect = trigger.getBoundingClientRect();
  const maxWidth = Math.min(260, window.innerWidth - viewportPadding * 2);
  tooltip.style.width = "max-content";
  tooltip.style.maxWidth = `${maxWidth}px`;
  const measuredWidth = tooltip.offsetWidth;
  const width = Math.min(maxWidth, measuredWidth);
  const height = tooltip.offsetHeight;
  const centeredLeft = rect.left + rect.width / 2 - width / 2;
  const clampedLeft = Math.max(
    viewportPadding,
    Math.min(centeredLeft, window.innerWidth - width - viewportPadding),
  );
  const aboveTop = rect.top - height - gap;
  const belowTop = rect.bottom + gap;

  position.width = width;
  position.left = clampedLeft;
  position.top = aboveTop >= viewportPadding ? aboveTop : belowTop;
}

async function show(): Promise<void> {
  if (props.disabled || !props.text) {
    return;
  }

  visible.value = true;
  await nextTick();
  updatePosition();
  window.addEventListener("scroll", updatePosition, true);
  window.addEventListener("resize", updatePosition);
}

function hide(): void {
  visible.value = false;
  window.removeEventListener("scroll", updatePosition, true);
  window.removeEventListener("resize", updatePosition);
}

onBeforeUnmount(() => {
  hide();
});
</script>

<template>
  <span
    ref="triggerRef"
    class="inline-flex"
    :class="props.triggerClass"
    @mouseenter="show"
    @mouseleave="hide"
  >
    <slot />
  </span>

  <Teleport to="body">
    <div
      v-if="visible"
      ref="tooltipRef"
      role="tooltip"
      class="pointer-events-none fixed z-[9999] rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-medium normal-case leading-snug text-zinc-700 opacity-100 shadow-dashboard dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      :style="{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: position.width > 0 ? `${position.width}px` : 'max-content',
        maxWidth: 'calc(100vw - 24px)',
        whiteSpace: 'pre-line',
        overflowWrap: 'anywhere',
      }"
    >
      {{ text }}
    </div>
  </Teleport>
</template>
