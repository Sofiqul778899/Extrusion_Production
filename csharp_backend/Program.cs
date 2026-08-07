using Microsoft.EntityFrameworkCore;
using MPBL.Extrusion.Api.Data;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configure Entity Framework Core with Microsoft SQL Server
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Enable CORS for React Frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp",
        policy => policy.AllowAnyOrigin()
                        .AllowAnyMethod()
                        .AllowAnyHeader());
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "MPBL Extrusion API v1");
        c.RoutePrefix = string.Empty; // Serves Swagger UI at application root (http://localhost:PORT/)
    });
}

app.MapGet("/swagger", () => Results.Redirect("/"));

app.UseCors("AllowReactApp");
app.UseAuthorization();
app.MapControllers();

app.Run();
