/** @odoo-module **/

import { Component, useState, useEffect, onMounted } from "@odoo/owl";

const { DateTime } = luxon;

export class GanttMonthYearSelector extends Component {
  static template = "hotel_gantt_extension.GanttMonthYearSelector";
  static props = ["model"];

  setup() {
    this.model = this.props.model;
    this.currentDate = DateTime.local();

    this._isFetching = false;
    this.ui = useState({ loading: false });

    this.months = Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: this.currentDate.set({ month: i + 1 }).toFormat("MMMM"),
    }));

    let initialFocusDate = this.currentDate;
    try {
      const saved = localStorage.getItem("hotel_gantt_focusDate");
      if (saved) {
        const parsed = DateTime.fromISO(saved);
        if (parsed.isValid) {
          initialFocusDate = parsed;
        }
      } else {
        initialFocusDate = this.model.metaData.focusDate;
      }
    } catch (error) {
      console.warn("No se pudo leer localStorage:", error);
    }

    this.getYears = () => {
      const currentYear = this.currentDate.year;

      return Array.from({ length: 51 }, (_, i) => currentYear + i);
    };

    this.state = useState({
      month: initialFocusDate.month,
      year: initialFocusDate.year,
    });

    this.firstRun = true;

    useEffect(() => {
      const currentFocusDate = this.model.metaData.focusDate;

      if (currentFocusDate) {
        if (this.firstRun) {
          this.firstRun = false;
          return;
        }

        if (
          this.state.month !== currentFocusDate.month ||
          this.state.year !== currentFocusDate.year
        ) {
          this.state.month = currentFocusDate.month;
          this.state.year = currentFocusDate.year;
        }
      }
    });

    onMounted(() => {
      const focusDateFromState = this.getFocusDateFromStateOrModel();
      const modelFocusDate = this.model.metaData.focusDate;

      if (!modelFocusDate || !focusDateFromState.equals(modelFocusDate)) {
        this.updateModel();
      }
    });
  }

  updateModel() {
    const { month, year } = this.state;
    const isValidYear = year >= this.currentDate.year;

    const finalMonth = month || this.currentDate.month;
    const finalYear = isValidYear ? year : this.currentDate.year;

    const focusDate = DateTime.fromObject({
      year: finalYear,
      month: finalMonth,
      day: 1,
    }).startOf("month");

    try {
      localStorage.setItem("hotel_gantt_focusDate", focusDate.toISO());
    } catch (error) {
      console.error(error);
    }

    this.model.fetchData({
      focusDate,
      scaleId: this.determineScale(month, finalYear),
      reCache: true,
    });
  }

  determineScale(month, year) {
    if (year && !month) return "year";
    if (month && !year) return "month";
    return this.model.metaData.scale.id;
  }

  onMonthChange(ev) {
    this.state.month = parseInt(ev.target.value, 10);
    this.updateModel();
  }

  onYearChange(ev) {
    const maxYear = this.currentDate.year + 50;
    const inputYear = parseInt(ev.target.value, 10);
    this.state.year = Math.min(inputYear, maxYear);
    this.updateModel();
  }

  async refreshView() {
    if (this.ui.loading) return;
    this.ui.loading = true;
    try {
      const focusDate = this.getFocusDateFromStateOrModel();

      this.model.metaData = { ...(this.model.metaData || {}), focusDate };

      await this.model.fetchData({ focusDate, reCache: true });

      this.env?.bus?.trigger("hotel:gantt:refreshed", { focusDate });
    } catch (error) {
      console.error("Error refreshing Gantt:", error);
    } finally {
      this.ui.loading = false;
    }
  }

  getFocusDateFromStateOrModel() {
    const { month, year } = this.state;

    if (month && year) {
      return DateTime.fromObject({ year, month, day: 1 }).startOf("month");
    }

    if (this.model?.metaData?.focusDate) {
      return this.model.metaData.focusDate.startOf("month");
    }

    return DateTime.local().startOf("month");
  }
}
