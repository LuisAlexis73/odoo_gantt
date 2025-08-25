# -*- coding: utf-8 -*-
# See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from collections import defaultdict
from datetime import timedelta


class HotelFolioLine(models.Model):
    _inherit = "hotel.folio.line"

    colour_odoo = fields.Integer(related="folio_id.reservation_status_id.colour_odoo", store=True)
    folio_number = fields.Char(related="folio_id.name", store=True)
    room_overbook = fields.Integer(
        string="Overbook Qty", related="room_id.overbook_quantity", readonly=True
    )
    daily_availability = fields.Text(
        string="Daily Availability",
    ) #  compute="_compute_daily_availability"
    room_number_name = fields.Char(
        string="Room Number Name", compute="_compute_room_number_name"
    )
    guest_name = fields.Char(string="Guest Name", compute="_compute_guest_name")
    reference_name = fields.Char(string="Folio Reference", related="folio_id.reference")
    internal_res_no = fields.Char(string="Internal Reservation Number", related="folio_id.internal_res_no")

    checkin_datetime = fields.Datetime(
        "Check In DateTime", compute="_compute_datetime", store=True
    )
    checkout_datetime = fields.Datetime(
        "Check Out DateTime", compute="_compute_datetime", store=True
    )

    @api.depends("checkin_date", "checkout_date")
    def _compute_datetime(self):
        for record in self:
            if record.checkin_date:
                checkin_dt = fields.Datetime.to_datetime(record.checkin_date)
                record.checkin_datetime = checkin_dt.replace(
                    hour=16, minute=0, second=0
                )
            else:
                record.checkin_datetime = False

            if record.checkout_date:
                checkout_dt = fields.Datetime.to_datetime(record.checkout_date)
                record.checkout_datetime = checkout_dt.replace(
                    hour=14, minute=0, second=0
                )
            else:
                record.checkout_datetime = False

    @api.depends(
        "room_id",
        "room_id.rooms_qty",
        "room_id.overbook_quantity",
        "checkin_date",
        "checkout_date",
    )
    def _compute_daily_availability(self):
        folio_line_obj = self.env["hotel.folio.line"]
        week_days = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]

        today = fields.Date.today()
        for line in self:
            availability = {}
            if not line.room_id or not line.checkin_date or not line.checkout_date:
                line.daily_availability = "{}"
                continue

            room_numbers = line.room_id.room_number_ids

            reservations = folio_line_obj.search(
                [("room_number_id", "=", room_numbers.ids), ("state", "!=", "cancel")]
            )

            occupancy = defaultdict(set)
            for res in reservations:
                start = res.checkin_date
                end = res.checkout_date
                if not start or not end:
                    continue

                for i in range((end - start).days + 1):
                    date = start + timedelta(days=i)
                    if date >= today:
                        occupancy[date].add(res.room_number_id.id)

                for i in range((line.checkout_date - line.checkin_date).days + 1):
                    date = line.checkin_date + timedelta(days=i)
                    if date < today:
                        continue

                    available_rooms = [
                        r for r in room_numbers if r.id not in occupancy[date]
                    ]

                    if available_rooms:
                        room_name = available_rooms[0].name
                        occupancy[date].add(room_name)
                        room_label = room_name or room_name.display_name
                    else:
                        room_name = "Unavailable"

                    key = f"{week_days[date.weekday()]}-{date.day}"
                    availability[key] = room_label

                line.daily_availability = ", ".join(
                    f"{key}: {value}" for key, value in availability.items()
                )

    @api.depends("room_number_id")
    def _compute_room_number_name(self):
        for record in self:
            record.room_number_name = (
                record.room_number_id.name
                if record.room_number_id
                else "Undefined Room"
            )

    @api.depends("folio_id", "folio_id.partner_id", "folio_id.partner_id.name")
    def _compute_guest_name(self):
        for record in self:
            record.guest_name = record.folio_id.partner_id.name

    @api.depends(
        "folio_id",
        "folio_id.reservation_status_id",
        "folio_id.reservation_status_id.colour",
    )
    def _compute_status_colour(self):
        for line in self:
            line.status_colour = (
                line.folio_id and line.folio_id.reservation_status_id.colour or False
            )

    @api.model
    def get_room_number(self):
        response = defaultdict(list)

        room_types = self.env["hotel.room"].search([])

        for room_type in room_types:
            room_numbers = self.env["hotel.room.number"].search(
                [("room_id", "=", room_type.id)]
            )
            response[(room_type.id, room_type.name)] = [
                (r.id, r.name) for r in room_numbers
            ]

        for rec in self.search([]):
            room_id_key = (rec.room_id.id, rec.room_id.name)
            room_number = (rec.room_number_id.id, rec.room_number_id.name)

            if room_number not in response[room_id_key]:
                response[room_id_key].append(room_number)

        return {
            "payload": [{"room_id": k, "room_numbers": v} for k, v in response.items()]
        }

    def get_gantt_record_data(self, read_specification):
        record_ids = self.with_context(active_test=False).search_fetch(
            [("id", "=", self.id)], read_specification.keys()
        )[0]
        return record_ids.with_env(self.env).web_read(read_specification)[0]
