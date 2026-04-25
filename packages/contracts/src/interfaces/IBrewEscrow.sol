// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IBrewEscrow {
    struct Trust {
        address sponsor;
        address beneficiary;
        address token;
        uint256 amount;
        uint64 deadline;
        bytes32 templateId;
        bool released;
    }

    error NotVerifier();
    error TrustAlreadyReleased(uint256 trustId);
    error TrustDoesNotExist(uint256 trustId);
    error DeadlineNotPassed(uint64 deadline);
    error NotSponsor(address caller, address sponsor);
    error InvalidTrustParams();

    event VerifierUpdated(address indexed verifier);

    event TrustCreated(
        uint256 indexed trustId,
        address indexed sponsor,
        address indexed beneficiary,
        bytes32 templateId,
        address token,
        uint256 amount,
        uint64 deadline
    );

    event Released(
        uint256 indexed trustId,
        address indexed beneficiary,
        uint256 amount
    );
    event Refunded(
        uint256 indexed trustId,
        address indexed sponsor,
        uint256 amount
    );

    function setVerifier(address verifier) external;

    function createTrust(
        address beneficiary,
        address token,
        uint256 amount,
        uint64 deadline,
        bytes32 templateId
    ) external returns (uint256 trustId);

    function releaseTo(uint256 trustId, address recipient) external;

    function refund(uint256 trustId) external;

    function isReleased(
        uint256 trustId,
        address beneficiary
    ) external view returns (bool);

    function trusts(uint256 trustId) external view returns (Trust memory);
}
