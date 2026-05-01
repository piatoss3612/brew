// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library BrewConfig {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;
    address internal constant BASE_SEPOLIA_EAS = 0x4200000000000000000000000000000000000021;
    address internal constant BASE_SEPOLIA_SCHEMA_REGISTRY = 0x4200000000000000000000000000000000000020;

    bytes32 internal constant WORKPLACE_TEMPLATE_ID = keccak256("workplace_verified:0.1.0");
    bytes32 internal constant DEGREE_TEMPLATE_ID = keccak256("degree_verified:0.1.0");
    bytes32 internal constant DAO_GRANT_TEMPLATE_ID = keccak256("dao_grant:0.1.0");
    bytes32 internal constant FELLOWSHIP_TEMPLATE_ID = keccak256("fellowship_milestone:0.1.0");

    string internal constant WORKPLACE_SCHEMA =
        "string name, string employer, uint64 start_date, string verification_source, uint64 verification_timestamp";
    string internal constant DEGREE_SCHEMA =
        "string name, string university, string degree_type, uint64 conferral_date, string ope_id, bytes32 transcript_hash, string verification_source";
    string internal constant DAO_GRANT_SCHEMA =
        "uint8 milestone_index, string deliverable_uri, bytes32 deliverable_hash";
    string internal constant FELLOWSHIP_SCHEMA =
        "uint8 quarter, string report_uri, bytes32 report_hash, string program_name";

    bytes32 internal constant WORKPLACE_SCHEMA_UID = 0x01a3629d02136181035c01693fc6fa5e868061456b8865f56ba9c51a4b36b5c1;
    bytes32 internal constant DEGREE_SCHEMA_UID = 0xd9d697d74ca8ad8f0ee967b724eccadee7695b8f9a12f0ddb580e6aa6bbb3325;
    bytes32 internal constant DAO_GRANT_SCHEMA_UID = 0x6429c150638a057d5d4b034e6530c9f1b5f300fc96edc0461d25effd8bfda9d5;
    bytes32 internal constant FELLOWSHIP_SCHEMA_UID =
        0xcd32f560f8ee50bc49024b8d847d4dabb9bf3672d88c6a64207e83dfde4f6a6a;

    uint64 internal constant WORKPLACE_EXPIRY_WINDOW = 7_776_000;
    uint64 internal constant WORKPLACE_STALENESS_WINDOW = 2_592_000;

    uint64 internal constant DEGREE_EXPIRY_WINDOW = 31_536_000;
    uint64 internal constant DEGREE_STALENESS_WINDOW = 7_776_000;

    uint64 internal constant DAO_GRANT_EXPIRY_WINDOW = 5_184_000;
    uint64 internal constant DAO_GRANT_STALENESS_WINDOW = 1_209_600;

    uint64 internal constant FELLOWSHIP_EXPIRY_WINDOW = 7_776_000;
    uint64 internal constant FELLOWSHIP_STALENESS_WINDOW = 1_209_600;

    function workplaceSchemaUid() internal pure returns (bytes32) {
        return WORKPLACE_SCHEMA_UID;
    }

    function degreeSchemaUid() internal pure returns (bytes32) {
        return DEGREE_SCHEMA_UID;
    }

    function daoGrantSchemaUid() internal pure returns (bytes32) {
        return DAO_GRANT_SCHEMA_UID;
    }

    function fellowshipSchemaUid() internal pure returns (bytes32) {
        return FELLOWSHIP_SCHEMA_UID;
    }

    function schemaUid(string memory schema) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(schema, address(0), true));
    }
}
