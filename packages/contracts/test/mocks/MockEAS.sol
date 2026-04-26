// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Attestation} from "@eas/Common.sol";

contract MockEAS {
    mapping(bytes32 uid => Attestation) private _attestations;

    function setAttestation(Attestation memory attestation) external {
        _attestations[attestation.uid] = attestation;
    }

    function getAttestation(bytes32 uid) external view returns (Attestation memory) {
        return _attestations[uid];
    }

    function isAttestationValid(bytes32 uid) external view returns (bool) {
        return _attestations[uid].uid != bytes32(0);
    }
}
