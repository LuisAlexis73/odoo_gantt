# -*- coding: utf-8 -*-
# See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models

class HotelRoomNumber(models.Model):
    _inherit = 'hotel.room.number'

    reservation_ids = fields.One2many(
        'hotel.folio.line',
        'room_number_id',
        string='Reservations'
    )
    current_reservation_id = fields.Many2one(
        'hotel.folio.line',
        string='Current Reservation',
        compute='_compute_current_reservation',
        store=True
    )

    @api.depends('reservation_ids', 'reservation_ids.checkin_date', 'reservation_ids.checkout_date')
    def _compute_current_reservation(self):
      today = fields.Date.today()
      for room in self:
        active_reservations = room.reservation_ids.filtered(lambda res: res.checkin_date <= today <= res.checkout_date)
        room.current_reservation_id = active_reservations[:1] if active_reservations else False