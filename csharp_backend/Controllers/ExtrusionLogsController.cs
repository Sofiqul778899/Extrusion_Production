using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MPBL.Extrusion.Api.Data;
using MPBL.Extrusion.Api.Models;

namespace MPBL.Extrusion.Api.Controllers
{
    [ApiController]
    [Route("api/extrusion-logs")]
    public class ExtrusionLogsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public ExtrusionLogsController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<ExtrusionLog>>> GetLogs()
        {
            return await _context.ExtrusionLogs.OrderByDescending(l => l.Id).ToListAsync();
        }

        [HttpPost]
        public async Task<ActionResult<ExtrusionLog>> CreateLog(ExtrusionLog log)
        {
            _context.ExtrusionLogs.Add(log);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetLogs), new { id = log.Id }, log);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteLog(int id)
        {
            var log = await _context.ExtrusionLogs.FindAsync(id);
            if (log == null) return NotFound();

            _context.ExtrusionLogs.Remove(log);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}
