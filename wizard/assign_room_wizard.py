# -*- coding: utf-8 -*-
# See LICENSE file for full copyright and licensing details.

from dateutil.utils import today
from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

class AssignRoomWizard(models.TransientModel):
    _name = "assign.room.wizard"

    reservation_id = fields.Many2one(
        "hotel.folio.line",
        string="Reservation",
        required=True,
        default=lambda self: self.env.context.get("default_reservation_id"),
        domain="[('checkout_date', '>=', context_today())]",
    )
    room_id = fields.Many2one(
        "hotel.room.number",
        string="Room",
    )

    @api.depends('room_type_id')
    def _compute_room_number_id(self):
        for rec in self:
            rec.room_id_domin = [('id', '=', 0)]
            if rec.checkin_date and rec.checkout_date and rec.room_type_id:
                self._cr.execute("""SELECT room_number_id FROM
                                        hotel_folio_line WHERE (%s,%s) OVERLAPS
                                        (checkin_date, checkout_date) AND state != 'cancel'
                                        """,
                                 (rec.checkin_date, rec.checkin_date))
                datas = self._cr.fetchall()
                record_ids = [data[0] if data[0] else 0 for data in datas]
                rec.room_id_domin = [('room_id', '=', rec.room_type_id.id),
                                     ('state', '=', 'available'),
                                     ('room_number_type', '=', 'permanent'),
                                     ('id', 'not in', record_ids)]

    room_id_domin = fields.Binary(compute="_compute_room_number_id")

    current_reservation_id = fields.Many2one(
        "hotel.folio.line",
        string="Current Reservation",
        related="room_id.current_reservation_id",
        readonly=True,
    )
    room_type_id = fields.Many2one(
        "hotel.room",
        string="Room Type",
        related="reservation_id.room_id",
        readonly=True,
    )
    checkin_date = fields.Date(
        string="Check-in Date",
        related="reservation_id.checkin_date",
        readonly=True,
    )
    checkout_date = fields.Date(
        string="Check-out Date",
        related="reservation_id.checkout_date",
        readonly=True,
    )

    formatted_checkin_date = fields.Char(
        string="Formatted Check-in Date",
        compute="_compute_formatted_dates",
    )
    formatted_checkout_date = fields.Char(
        string="Formatted Check-out Date",
        compute="_compute_formatted_dates",
    )
    
    is_change_room = fields.Boolean(
        string="Is Change Room",
        default=lambda self: self.env.context.get("is_change_room", False),
    )

    def assign_room(self):
        self.ensure_one()
        self.reservation_id.room_number_id = self.room_id.id
        for sline in self.reservation_id.folio_id.service_lines.filtered(
                lambda s: s.folio_line_id.id == self.reservation_id.id and s.is_folio):
            sline.write({'room_number_id': self.room_id.id})
        for guest_room_id in self.reservation_id.folio_id.guest_room_ids.filtered(
                lambda g: g.folio_line_id and g.folio_line_id.id == self.reservation_id.id):
            guest_room_id.write({"room_number_id": self.room_id.id})

        return self._reload_action()

    def unassign_room(self):
        self.ensure_one()

        if not self.reservation_id.room_number_id:
            raise ValidationError(_(
                "Reservation room number is not found."
            ))

        self.reservation_id.room_number_id = False

        return self._reload_action()

    def _reload_action(self):
        # return {
        #     'type': 'ir.actions.client',
        #     'tag': 'reload_context',
        #     'params': {
        #         'default_reservation_id': self.reservation_id.id,
        #     }
        # }
        return True

    def display_button_text(self):
        return "Change Room" if self.reservation_id.room_number_id else "Assign Room"

    @api.depends('checkin_date', 'checkout_date')
    def _compute_formatted_dates(self):
        for rec in self:
            if rec.checkin_date:
                rec.formatted_checkin_date = rec.checkin_date.strftime('%d-%m-%Y')
            else:
                rec.formatted_checkin_date = ''

            if rec.checkout_date:
                rec.formatted_checkout_date = rec.checkout_date.strftime('%d-%m-%Y')
            else:
                rec.formatted_checkout_date = ''

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        
        res_id = res.get('reservation_id') or self.env.context.get('default_reservation_id')
        if res_id and 'room_id' in fields_list:
            folio = self.env['hotel.folio.line'].browse(res_id)
            if folio.room_number_id:
                res['room_id'] = folio.room_number_id.id

        return res
