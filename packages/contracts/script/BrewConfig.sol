// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library BrewConfig {
    address internal constant SEPOLIA_EAS = 0xC2679fBD37d54388Ce493F1DB75320D236e1815e;
    address internal constant SEPOLIA_SCHEMA_REGISTRY = 0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0;

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

    uint64 internal constant WORKPLACE_EXPIRY_WINDOW = 7_776_000;
    uint64 internal constant WORKPLACE_STALENESS_WINDOW = 2_592_000;

    uint64 internal constant DEGREE_EXPIRY_WINDOW = 31_536_000;
    uint64 internal constant DEGREE_STALENESS_WINDOW = 7_776_000;

    uint64 internal constant DAO_GRANT_EXPIRY_WINDOW = 5_184_000;
    uint64 internal constant DAO_GRANT_STALENESS_WINDOW = 1_209_600;

    uint64 internal constant FELLOWSHIP_EXPIRY_WINDOW = 7_776_000;
    uint64 internal constant FELLOWSHIP_STALENESS_WINDOW = 1_209_600;

    function workplaceSchemaUid() internal pure returns (bytes32) {
        return schemaUid(WORKPLACE_SCHEMA);
    }

    function degreeSchemaUid() internal pure returns (bytes32) {
        return schemaUid(DEGREE_SCHEMA);
    }

    function daoGrantSchemaUid() internal pure returns (bytes32) {
        return schemaUid(DAO_GRANT_SCHEMA);
    }

    function fellowshipSchemaUid() internal pure returns (bytes32) {
        return schemaUid(FELLOWSHIP_SCHEMA);
    }

    function schemaUid(string memory schema) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(schema, address(0), true));
    }
}
