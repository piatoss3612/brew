// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IBrewEscrow} from "./interfaces/IBrewEscrow.sol";

contract BrewEscrow is IBrewEscrow, Ownable {
    using SafeERC20 for IERC20;

    address public verifier;
    uint256 public nextTrustId;

    mapping(uint256 trustId => Trust) private _trusts;

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setVerifier(address newVerifier) external onlyOwner {
        if (newVerifier == address(0)) revert InvalidTrustParams();

        verifier = newVerifier;

        emit VerifierUpdated(newVerifier);
    }

    function createTrust(
        address beneficiary,
        address token,
        uint256 amount,
        uint64 deadline,
        bytes32 templateId
    ) external returns (uint256 trustId) {
        if (beneficiary == address(0)) revert InvalidTrustParams();
        if (token == address(0)) revert InvalidTrustParams();
        if (amount == 0) revert InvalidTrustParams();
        if (deadline != 0 && deadline <= block.timestamp) {
            revert InvalidTrustParams();
        }

        trustId = nextTrustId++;
        _trusts[trustId] = Trust({
            sponsor: msg.sender,
            beneficiary: beneficiary,
            token: token,
            amount: amount,
            deadline: deadline,
            templateId: templateId,
            released: false,
            refunded: false
        });

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit TrustCreated(
            trustId,
            msg.sender,
            beneficiary,
            templateId,
            token,
            amount,
            deadline
        );
    }

    function releaseTo(uint256 trustId, address recipient) external {
        if (msg.sender != verifier) revert NotVerifier();

        Trust storage trust = _loadTrust(trustId);
        if (trust.released) revert TrustAlreadyReleased(trustId);
        if (trust.refunded) revert TrustAlreadyRefunded(trustId);
        if (recipient != trust.beneficiary) revert InvalidTrustParams();

        trust.released = true;

        IERC20(trust.token).safeTransfer(recipient, trust.amount);

        emit Released(trustId, recipient, trust.amount);
    }

    function refund(uint256 trustId) external {
        Trust storage trust = _loadTrust(trustId);
        if (msg.sender != trust.sponsor) {
            revert NotSponsor(msg.sender, trust.sponsor);
        }
        if (trust.released) revert TrustAlreadyReleased(trustId);
        if (trust.refunded) revert TrustAlreadyRefunded(trustId);
        if (trust.deadline == 0) revert RefundDisabled(trustId);
        if (block.timestamp < trust.deadline) {
            revert DeadlineNotPassed(trust.deadline);
        }

        trust.refunded = true;

        IERC20(trust.token).safeTransfer(trust.sponsor, trust.amount);

        emit Refunded(trustId, trust.sponsor, trust.amount);
    }

    function isReleased(
        uint256 trustId,
        address beneficiary
    ) external view returns (bool) {
        Trust storage trust = _trusts[trustId];
        return trust.beneficiary == beneficiary && trust.released;
    }

    function trusts(uint256 trustId) external view returns (Trust memory) {
        return _loadTrust(trustId);
    }

    function _loadTrust(
        uint256 trustId
    ) internal view returns (Trust storage trust) {
        trust = _trusts[trustId];
        if (trust.sponsor == address(0)) revert TrustDoesNotExist(trustId);
    }
}
