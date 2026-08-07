using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MPBL.Extrusion.Api.Models
{
    [Table("pending_orders")]
    public class PendingOrder
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Column("pi_number")]
        public string PiNumber { get; set; } = string.Empty;

        [Column("customer")]
        public string Customer { get; set; } = string.Empty;

        [Column("retailer")]
        public string Retailer { get; set; } = string.Empty;

        [Column("order_qty")]
        public decimal OrderQty { get; set; }

        [Column("produced_qty")]
        public decimal ProducedQty { get; set; }

        [Column("status")]
        public string Status { get; set; } = "Pending";
    }
}
