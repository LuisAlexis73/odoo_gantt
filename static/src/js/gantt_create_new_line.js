/** @odoo-module **/

import { GanttController } from "@web_gantt/gantt_controller";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";

const _originalSetup = GanttController.prototype.setup;

patch(GanttController.prototype, {
  setup() {
    _originalSetup.call(this, ...arguments);

    this.actionService = useService("action");
  },

  async onCreateReservation() {
    await this.actionService.doAction({
      type: "ir.actions.act_window",
      res_model: "hotel.folio",
      view_mode: "form",
      views: [[false, "form"]],
      target: "new",
    });

    await this.model.load(this.props);
  },
});
