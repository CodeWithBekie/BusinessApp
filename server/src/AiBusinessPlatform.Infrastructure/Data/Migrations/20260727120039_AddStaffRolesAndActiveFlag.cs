using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBusinessPlatform.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStaffRolesAndActiveFlag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Defaults to true (not the bool type's natural false) so every pre-existing
            // BusinessUser row — created before this column existed — stays able to log in;
            // only staff invited going forward via POST /api/staff can be created inactive.
            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "BusinessUsers",
                type: "boolean",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "BusinessUsers");
        }
    }
}
