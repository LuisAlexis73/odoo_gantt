/** @odoo-module **/

import { GanttPopover } from "@web_gantt/gantt_popover";
import { patch } from "@web/core/utils/patch";

GanttPopover.props.push("onAssignRoom?");
GanttPopover.props.push("onOpenFolio?");

patch(GanttPopover.prototype, {
  setup() {
    super.setup(...arguments);

    this.reservationRoomNumber = this.props.context.room_number_id;
  },

  getButtonText() {
    return this.reservationRoomNumber ? "Change Room" : "Assign Room";
  },

  onAssignRoom() {
    const resId = this.props.context.res_id;

    if (!resId) {
      this.env.services.notification.add({
        type: "danger",
        message: "No reservation id found",
      });
      return;
    }

    this.props.close();

    this.env.services.action.doAction(
      {
        type: "ir.actions.act_window",
        res_model: "assign.room.wizard",
        view_mode: "form",
        views: [[false, "form"]],
        target: "new",
        context: {
          default_reservation_id: resId,
          is_change_room: !!this.reservationRoomNumber,
        },
      },

      {
        onClose: async (closeInfo) => {
          this.props.onAssignRoom();
        },
      }
    );
  },



  onOpenFolioForm() {
    const folioId = this.props.context.folio_id;

    if (!folioId) {
      this.env.services.notification.add({
        type: "danger",
        message: "No folio id found",
      });
      return;
    }

    this.props.close();

    this.env.services.action
      .loadAction("hotel.open_hotel_folio1_form_tree_all")
      .then((action) => {
        action.res_id = folioId[0];
        action.view_mode = "form";
        action.views = [[false, "form"]];
        action.target = "new";
        this.env.services.action.doAction(action, {
          onClose: async (closeInfo) => {
            this.props.onOpenFolio();
          },
        });
      });
  },
});
