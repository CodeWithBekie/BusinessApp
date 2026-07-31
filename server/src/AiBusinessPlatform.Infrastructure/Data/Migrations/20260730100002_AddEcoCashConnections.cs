using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBusinessPlatform.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEcoCashConnections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EcoCashConnections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BusinessId = table.Column<Guid>(type: "uuid", nullable: false),
                    Username = table.Column<string>(type: "text", nullable: false),
                    Password = table.Column<string>(type: "text", nullable: false),
                    MerchantCode = table.Column<string>(type: "text", nullable: false),
                    MerchantPin = table.Column<string>(type: "text", nullable: false),
                    MerchantNumber = table.Column<string>(type: "text", nullable: false),
                    MerchantName = table.Column<string>(type: "text", nullable: false),
                    SuperMerchantName = table.Column<string>(type: "text", nullable: false),
                    CountryCode = table.Column<string>(type: "text", nullable: false),
                    TerminalId = table.Column<string>(type: "text", nullable: false),
                    Location = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EcoCashConnections", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EcoCashConnections");
        }
    }
}
