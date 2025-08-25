/** @odoo-module **/

import { GanttModel } from "@web_gantt/gantt_model";
import { patch } from "@web/core/utils/patch";
import { Domain } from "@web/core/domain";

import { serializeDate, serializeDateTime } from "@web/core/l10n/dates";

const { DateTime } = luxon;

function getMonthsBetweenDates(startDate, stopDate) {
  const start = startDate.startOf("day");
  const end = stopDate.startOf("day");

  const months = new Set();
  let current = start.startOf("month");

  while (current <= end) {
    months.add(current.toFormat("yyyy-MM"));
    current = current.plus({ months: 1 });
  }

  return Array.from(months);
}

function filterReservationsByDateRange(reservations, rangeStart, rangeEnd) {
  const res = [];
  for (let r of reservations.values()) {
    const checkIn = DateTime.fromSQL(r.checkin_datetime);
    const checkOut = DateTime.fromSQL(r.checkout_datetime);

    if (checkIn < rangeEnd && checkOut > rangeStart) {
      res.push(r);
    }
  }
  return res;
}

patch(GanttModel.prototype, {
  setup() {
    super.setup(...arguments);
    this.cachedMonths = new Set();
    this.cachedRecords = new Map();

    this.loadMonths = true;
  },

  /**
   * Fetches records to display (and groups if necessary).
   *
   * @protected
   * @param {MetaData} metaData
   * @param {Object} [additionalContext]
   */
  async _fetchData(metaData, additionalContext) {
    const { groupedBy } = metaData;

    if (this.loadMonths) {
      this.days_to_move = await this.orm.call(
        "ir.config_parameter",
        "get_param",
        [],
        {
          key: "dias_a_mover",
        }
      );

      this.meses_adelante = parseInt(
        await this.orm.call("ir.config_parameter", "get_param", [], {
          key: "meses_adelante",
        })
      );
      this.meses_atras = parseInt(
        await this.orm.call("ir.config_parameter", "get_param", [], {
          key: "meses_atras",
        })
      );

      this.cache_start_date = DateTime.now().minus({
        months: this.meses_atras,
      });
      this.cache_stop_date = DateTime.now().plus({
        months: this.meses_adelante,
      });

      this.loadMonths = false;
    }

    if (this.cachedMonths.size === 0) {
      // First cache load
      await this._addMonthsToCache(
        metaData,
        this.cache_start_date,
        this.cache_stop_date
      );
    }

    const records = filterReservationsByDateRange(
      this.cachedRecords,
      metaData.startDate,
      metaData.stopDate
    );

    const groups = await this._build_groups(records);
    groups.forEach((g) => (g.fromServer = true));

    const data = { count: records.length };

    data.records = this._parseServerData(metaData, records);
    data.rows = this._generateRows(metaData, {
      groupedBy,
      groups,
      parentGroup: [],
    });

    await this.keepLast.add(this._fetchDataPostProcess(metaData, data));

    this.data = data;
    this.metaData = metaData;
    this._nextMetaData = null;
  },

  async _addMonthsToCache(metaData, startDate, stopDate) {
    const _domain = this._get_new_domain(
      metaData,
      startDate.startOf("month"),
      stopDate.endOf("month")
    );
    const { groupedBy, pagerLimit, pagerOffset, resModel } = metaData;

    const context = {
      ...this.searchParams.context,
      group_by: groupedBy,
    };

    const specification = this._get_fetchData_fields(metaData);

    const cachedRecords = await this.orm.call(resModel, "get_gantt_data", [], {
      domain: _domain,
      groupby: groupedBy,
      read_specification: specification,
      context,
      limit: pagerLimit,
      offset: pagerOffset,
    });

    for (let r of cachedRecords.records) {
      this.cachedRecords.set(r.id, r);
    }

    const cachedMonths = getMonthsBetweenDates(startDate, stopDate);

    for (let m of cachedMonths) {
      this.cachedMonths.add(m);
    }
  },

  allMonthsInCache(startDate, stopDate) {
    const implied_months = getMonthsBetweenDates(startDate, stopDate);
    return implied_months.every((m) => this.cachedMonths.has(m));
  },

  async updateCachedRecord(resId) {
    const specification = this._get_fetchData_fields();

    const recordData = await this.orm.call(
      this.metaData.resModel,
      "get_gantt_record_data",
      [resId],
      {
        read_specification: specification,
      }
    );

    this.cachedRecords.set(resId, recordData);
  },

  _get_fetchData_fields(metaData = null) {
    if (metaData === null) {
      metaData = this.metaData;
    }

    const fields = this._getFields(metaData);
    const specification = {};
    for (const fieldName of fields) {
      specification[fieldName] = {};
      if (metaData.fields[fieldName].type === "many2one") {
        specification[fieldName].fields = { display_name: {} };
      }
    }

    return specification;
  },

  async _build_groups(records) {
    const res = [];
    const allGroups = await this.orm.call(
      "hotel.folio.line",
      "get_room_number",
      [],
      {}
    );

    for (let group of allGroups.payload) {
      const unassigned_records = [];
      const grouped = records.reduce((acc, rec) => {
        if (!rec.room_number_id) {
          unassigned_records.push(rec);
          return acc;
        }
        const id = rec.room_number_id.id;
        acc[id] = acc[id] || [];
        acc[id].push(rec);
        return acc;
      }, {});

      if (unassigned_records.length) {
        res.push({
          room_id: [group.room_id[0], group.room_id[1]],
          room_number_id: [false, "Not assigned Room"],
          __record_ids: unassigned_records.map((r) => r.id),
        });
      }

      for (let [roomNumId, roomNumName] of group.room_numbers) {
        if (!roomNumId || !roomNumName) {
          continue;
        }
        const recIds = (grouped[roomNumId] || []).map((r) => r.id);
        res.push({
          room_id: [group.room_id[0], group.room_id[1]],
          room_number_id: [roomNumId, roomNumName],
          __record_ids: recIds,
        });
      }
    }

    return res;
  },

  _get_new_domain(metaData, startDate, stopDate) {
    const { dateStartField, dateStopField } = metaData;
    const domain = Domain.and([
      this.searchParams.domain,
      [
        "&",
        [
          dateStartField,
          "<=",
          this.dateStopFieldIsDate(metaData)
            ? serializeDate(stopDate)
            : serializeDateTime(stopDate),
        ],
        [
          dateStopField,
          ">=",
          this.dateStartFieldIsDate(metaData)
            ? serializeDate(startDate)
            : serializeDateTime(startDate),
        ],
      ],
    ]);
    return domain.toList();
  },

  async setFocusDate(direction) {
    const metaData = this._buildMetaData();
    let { focusDate, scale } = metaData;

    if (direction === "next") {
      focusDate = focusDate.plus({ [scale.id]: 1 });
    } else if (direction === "previous") {
      focusDate = focusDate.minus({ [scale.id]: 1 });
    } else {
      focusDate = DateTime.local();
      localStorage.removeItem("hotel_gantt_focusDate");
    }
    await this.fetchData({ focusDate, reCache: true });
  },

  async fetchData(params) {
    if (!params) {
      params = {};
    }

    let { reCache, ...newParams } = params;
    let metaData = this._buildMetaData(newParams);

    if (reCache) {
      // Expand implied months by 1
      let focusDate = params.focusDate;
      const implied_months = getMonthsBetweenDates(
        focusDate.minus({ months: 1 }),
        focusDate.plus({ months: 1 })
      );

      const months_to_add = implied_months.filter((m) => {
        if (!this.cachedMonths.has(m)) {
          return true;
        }

        if (!this.monthHasCachedRecords(m)) {
          return true;
        }
      });

      if (months_to_add.length) {
        let startMonth = DateTime.fromFormat(
          months_to_add[0],
          "yyyy-MM"
        ).startOf("month");
        let endMonth;

        if (months_to_add.length === 1) {
          endMonth = startMonth.endOf("month");
        } else {
          // Cachea todo el rango de meses (Puede que dentro de este rango ya haya meses cacheados, por lo q se recachean)
          endMonth = DateTime.fromFormat(months_to_add.at(-1), "yyyy-MM").endOf(
            "month"
          );
        }

        await this._addMonthsToCache(metaData, startMonth, endMonth);
      }
    }

    await this._fetchData(metaData);
    this.useSampleModel = false;
    this.notify();
  },

  monthHasCachedRecords(m) {
    try {
      const [yr, mo] = m.split("-").map((v) => parseInt(v, 10));
      const startOfMonth = DateTime.fromObject({
        year: yr,
        month: mo,
        day: 1,
      }).startOf("month");
      const endOfMonth = startOfMonth.endOf("month");
      for (let rec of this.cachedRecords.values()) {
        const checkIn = DateTime.fromSQL(rec.checkin_datetime);
        const checkOut = DateTime.fromSQL(rec.checkout_datetime);
        if (checkIn < endOfMonth && checkOut > startOfMonth) {
          return true;
        }
      }
    } catch (error) {
      console.error("monthHasCachedRecords error:", error);
    }
    return false;
  },
});
