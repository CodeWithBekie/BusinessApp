using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBusinessPlatform.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEcoCashEndUserId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EcoCashEndUserId",
                table: "Payments",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EcoCashEndUserId",
                table: "Payments");
        }
    }
}
