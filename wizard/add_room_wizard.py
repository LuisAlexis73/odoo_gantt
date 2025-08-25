# -*- coding: utf-8 -*-
# See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models

class AddRoomWizard(models.TransientModel):
  _inherit = 'add.room.wizard'

  checkin_datetime = fields.Datetime(compute='_compute_datetime')
  checkout_datetime = fields.Datetime(compute='_compute_datetime')

  @api.depends('checkin_datetime', 'checkout_datetime')
  def _compute_datetime(self):
    for rec in self:
      if rec.checkin:
        checkin_dt = fields.Datetime.to_datetime(rec.checkin)
        rec.checkin_datetime = checkin_dt.replace(hour=16, minute=0, second=0)
      else:
        rec.checkin_datetime = False

      if rec.checkout:
        checkout_dt = fields.Datetime.to_datetime(rec.checkout)
        rec.checkout_datetime = checkout_dt.replace(hour=14, minute=0, second=0)
      else:
        rec.checkout_datetime = False