/** @odoo-module **/

import { GanttRenderer } from "@web_gantt/gantt_renderer";
import { GanttMonthYearSelector } from "./gantt_month_year_selector";
import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";

function throttle(fn, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}

patch(GanttRenderer, {
  GRID_ROW_HEIGHT: 6,
  ROW_SPAN: 4,
  GROUP_ROW_SPAN: 4,
  components: {
    ...GanttRenderer.components,
    GanttMonthYearSelector,
  },
});

patch(GanttRenderer.prototype, {
  setup() {
    super.setup(...arguments);

    this.days_to_move = parseInt(this.model.days_to_move);

    onMounted(() => {
      const container = this.cellContainerRef.el;
      container.tabIndex = 0;

      container.addEventListener(
        "keyup",
        throttle((e) => {
          e.preventDefault();

          if (!["ArrowLeft", "ArrowRight"].includes(e.key)) {
            return;
          }

          const metaData = this.model._buildMetaData();
          let newStartDate;
          let newStopDate;

          if (e.key === "ArrowLeft") {
            newStartDate = metaData.startDate.minus({
              days: this.days_to_move,
            });
            newStopDate = metaData.stopDate.minus({ days: this.days_to_move });
          } else if (e.key === "ArrowRight") {
            newStartDate = metaData.startDate.plus({ days: this.days_to_move });
            newStopDate = metaData.stopDate.plus({ days: this.days_to_move });

            if (
              metaData.startDate.month !== newStartDate.month ||
              metaData.startDate.year !== newStartDate.year
            ) {
              newStartDate = newStartDate.startOf("month");
              newStopDate = newStartDate.endOf("month");
            }
          }

          let newFocusDate = newStartDate;
          if (!this.model.allMonthsInCache(newStartDate, newStopDate)) {
            newFocusDate = metaData.startDate.startOf("month");
          }
          this.model.fetchData({
            focusDate: newFocusDate,
          });
        }, 100)
      );

      // Horizontal scroll handling
      container.addEventListener(
        "wheel",
        throttle((e) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            e.preventDefault();
            const arrowEvent = new KeyboardEvent("keyup", {
              key: e.deltaX > 0 ? "ArrowRight" : "ArrowLeft",
            });
            container.dispatchEvent(arrowEvent);
          }
        }, 100),
        { passive: false }
      );
    });
  },

  getPopoverProps(pill) {
    const props = super.getPopoverProps(pill);

    return {
      ...props,
      context: { ...props.context, res_id: pill.record.id },
      title: pill.record.reference_name,
      onAssignRoom: async () => await this.onCloseAssignRoom(pill.record.id),
      onOpenFolio: async () => await this.onCloseAssignRoom(pill.record.id),
    };
  },

  getDisplayName(pill) {
    const { computePillDisplayName } = this.model.metaData;
    const { record } = pill;

    if (!computePillDisplayName) {
      return record.reference_name || record.folio_number;
    }
  },

  async onCloseAssignRoom(resId) {
    await this.model.updateCachedRecord(resId);
    await this.model.fetchData();
  },

  get isTouchDevice() {
    return true;
  },

  enrichPill(pill) {
    const { colorField, fields, pillDecorations, progressField } =
      this.model.metaData;

    pill.displayName = this.getDisplayName(pill);

    const classes = [];

    if (pillDecorations) {
      const pillContext = Object.assign({}, this.userService.context);
      for (const [fieldName, value] of Object.entries(pill.record)) {
        const field = fields[fieldName];
        switch (field.type) {
          case "date": {
            pillContext[fieldName] = value ? serializeDate(value) : false;
            break;
          }
          case "datetime": {
            pillContext[fieldName] = value ? serializeDateTime(value) : false;
            break;
          }
          default: {
            pillContext[fieldName] = value;
          }
        }
      }

      for (const decoration in pillDecorations) {
        const expr = pillDecorations[decoration];
        if (evaluateBooleanExpr(expr, pillContext)) {
          classes.push(decoration);
        }
      }
    }

    if (colorField) {
      pill._color = pill.record.colour_odoo;
      classes.push(`o_gantt_color_${pill._color}`);
    }

    if (progressField) {
      pill._progress = pill.record[progressField] || 0;
    }

    pill.className = classes.join(" ");

    return pill;
  },

  getFormattedFocusDate() {
    const { focusDate, scale } = this.model.metaData;
    const scaleId = scale.id;

    if (scaleId !== "month") {
      return formatDateTime(focusDate, { format: scale.format });
    }

    const labels = [];
    for (const column of this.columns || []) {
      const columnStartDate = column?.start;
      if (!columnStartDate || !columnStartDate.isValid) continue;

      const monthYearLabel = columnStartDate.toFormat("LLLL yyyy");

      if (labels[labels.length - 1] !== monthYearLabel) {
        labels.push(monthYearLabel);
      }
    }

    if (!labels.length) {
      return formatDateTime(focusDate, { format: scale.format });
    }

    return labels.length === 1 ? labels[0] : labels.join(" - ");
  },
});
