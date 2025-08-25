# -*- coding: utf-8 -*-
# See LICENSE file for full copyright and licensing details.

from odoo import fields, models

class HotelReservationStatus(models.Model):
  _inherit = "hotel.reservation.status"

  colour_odoo = fields.Integer(string="Color indice ODOO")