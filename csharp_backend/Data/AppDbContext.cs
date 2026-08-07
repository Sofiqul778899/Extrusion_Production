using Microsoft.EntityFrameworkCore;
using MPBL.Extrusion.Api.Models;

namespace MPBL.Extrusion.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<ExtrusionLog> ExtrusionLogs => Set<ExtrusionLog>();
        public DbSet<PendingOrder> PendingOrders => Set<PendingOrder>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            
            modelBuilder.Entity<ExtrusionLog>().ToTable("extrusion_logs");
            modelBuilder.Entity<PendingOrder>().ToTable("pending_orders");
        }
    }
}
