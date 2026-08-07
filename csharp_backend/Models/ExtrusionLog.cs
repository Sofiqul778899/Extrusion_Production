using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MPBL.Extrusion.Api.Models
{
    [Table("extrusion_logs")]
    public class ExtrusionLog
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Column("date")]
        public string Date { get; set; } = string.Empty;

        [Column("shift")]
        public string Shift { get; set; } = string.Empty;

        [Column("machine_no")]
        public string MachineNo { get; set; } = string.Empty;

        [Column("pi_no")]
        public string PiNo { get; set; } = string.Empty;

        [Column("operator_name")]
        public string OperatorName { get; set; } = string.Empty;

        [Column("item_name")]
        public string ItemName { get; set; } = string.Empty;

        [Column("size_inch")]
        public string SizeInch { get; set; } = string.Empty;

        [Column("gauge")]
        public string Gauge { get; set; } = string.Empty;

        [Column("color")]
        public string Color { get; set; } = string.Empty;

        [Column("material")]
        public string Material { get; set; } = string.Empty;

        [Column("qty_kg")]
        public decimal QtyKg { get; set; }

        [Column("rolls_count")]
        public int RollsCount { get; set; }

        [Column("waste_kg")]
        public decimal WasteKg { get; set; }

        [Column("remarks")]
        public string? Remarks { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
