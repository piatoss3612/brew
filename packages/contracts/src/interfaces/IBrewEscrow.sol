// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IBrewEscrow {
    struct Trust {
        address sponsor;
        address beneficiary;
        address token;
        uint256 amount;
        uint64 deadline;
        bytes32 templateId;
        bool released;
        bool refunded;
    }

    error NotVerifier();
    error TrustAlreadyReleased(uint256 trustId);
    error TrustAlreadyRefunded(uint256 trustId);
    error TrustDoesNotExist(uint256 trustId);
    error RefundDisabled(uint256 trustId);
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

    event Released(uint256 indexed trustId, address indexed beneficiary, uint256 amount);
    event Refunded(uint256 indexed trustId, address indexed sponsor, uint256 amount);

    /// @notice Sets the verifier contract that can trigger escrow releases.
    function setVerifier(address verifier) external;

    /// @notice Creates a trust and transfers sponsor funds into escrow.
    function createTrust(address beneficiary, address token, uint256 amount, uint64 deadline, bytes32 templateId)
        external
        returns (uint256 trustId);

    /// @notice Releases escrowed funds to the trust beneficiary.
    function releaseTo(uint256 trustId, address recipient) external;

    /// @notice Refunds unreleased funds to the sponsor after the deadline.
    function refund(uint256 trustId) external;

    /// @notice Returns whether a trust has already been released for a
    ///         caller-asserted beneficiary.
    function isReleased(uint256 trustId, address beneficiary) external view returns (bool);

    /// @notice Returns the stored trust state.
    function trusts(uint256 trustId) external view returns (Trust memory);
}
