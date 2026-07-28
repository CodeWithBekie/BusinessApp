using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBusinessPlatform.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStaffInvitationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "InvitationExpiresAt",
                table: "BusinessUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvitationToken",
                table: "BusinessUsers",
                type: "text",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "BusinessUsers",
                keyColumn: "Id",
                keyValue: new Guid("00000000-0000-0000-0000-000000000002"),
                columns: new[] { "InvitationExpiresAt", "InvitationToken" },
                values: new object[] { null, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InvitationExpiresAt",
                table: "BusinessUsers");

            migrationBuilder.DropColumn(
                name: "InvitationToken",
                table: "BusinessUsers");
        }
    }
}
