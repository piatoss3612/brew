// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {BrewEscrow} from "../src/BrewEscrow.sol";
import {IBrewEscrow} from "../src/interfaces/IBrewEscrow.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract BrewEscrowTest is Test {
    BrewEscrow internal escrow;
    MockToken internal token;

    address internal owner = makeAddr("owner");
    address internal sponsor = makeAddr("sponsor");
    address internal verifier = makeAddr("verifier");
    address internal beneficiary = makeAddr("beneficiary");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant AMOUNT = 1_000 ether;
    bytes32 internal constant TEMPLATE_ID = keccak256("degree_verified:0.1.0");

    function setUp() public {
        escrow = new BrewEscrow(owner);
        token = new MockToken();
        token.mint(sponsor, AMOUNT * 10);

        vm.prank(owner);
        escrow.setVerifier(verifier);
    }

    function testCreateTrustTransfersFundsAndStoresState() public {
        uint256 trustId = _createTrust(0);

        assertEq(token.balanceOf(address(escrow)), AMOUNT);
        assertEq(token.balanceOf(sponsor), AMOUNT * 9);

        IBrewEscrow.Trust memory trust = escrow.trusts(trustId);
        assertEq(trust.sponsor, sponsor);
        assertEq(trust.beneficiary, beneficiary);
        assertEq(trust.token, address(token));
        assertEq(trust.amount, AMOUNT);
        assertEq(trust.deadline, 0);
        assertEq(trust.templateId, TEMPLATE_ID);
        assertFalse(trust.released);
        assertFalse(trust.refunded);
    }

    function testOnlyVerifierCanRelease() public {
        uint256 trustId = _createTrust(0);

        vm.prank(stranger);
        vm.expectRevert(IBrewEscrow.NotVerifier.selector);
        escrow.releaseTo(trustId, beneficiary);
    }

    function testVerifierCanReleaseToBeneficiary() public {
        uint256 trustId = _createTrust(0);

        vm.prank(verifier);
        escrow.releaseTo(trustId, beneficiary);

        assertEq(token.balanceOf(beneficiary), AMOUNT);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertTrue(escrow.isReleased(trustId, beneficiary));

        IBrewEscrow.Trust memory trust = escrow.trusts(trustId);
        assertTrue(trust.released);
        assertFalse(trust.refunded);
    }

    function testCannotReleaseTwice() public {
        uint256 trustId = _createTrust(0);

        vm.startPrank(verifier);
        escrow.releaseTo(trustId, beneficiary);

        vm.expectRevert(
            abi.encodeWithSelector(
                IBrewEscrow.TrustAlreadyReleased.selector,
                trustId
            )
        );
        escrow.releaseTo(trustId, beneficiary);
        vm.stopPrank();
    }

    function testReleaseRejectsWrongRecipient() public {
        uint256 trustId = _createTrust(0);

        vm.prank(verifier);
        vm.expectRevert(IBrewEscrow.InvalidTrustParams.selector);
        escrow.releaseTo(trustId, stranger);
    }

    function testRefundBeforeDeadlineReverts() public {
        uint64 deadline = uint64(block.timestamp + 7 days);
        uint256 trustId = _createTrust(deadline);

        vm.prank(sponsor);
        vm.expectRevert(
            abi.encodeWithSelector(
                IBrewEscrow.DeadlineNotPassed.selector,
                deadline
            )
        );
        escrow.refund(trustId);
    }

    function testRefundWithoutDeadlineReverts() public {
        uint256 trustId = _createTrust(0);

        vm.prank(sponsor);
        vm.expectRevert(
            abi.encodeWithSelector(IBrewEscrow.RefundDisabled.selector, trustId)
        );
        escrow.refund(trustId);
    }

    function testOnlySponsorCanRefund() public {
        uint64 deadline = uint64(block.timestamp + 7 days);
        uint256 trustId = _createTrust(deadline);
        vm.warp(deadline);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IBrewEscrow.NotSponsor.selector,
                stranger,
                sponsor
            )
        );
        escrow.refund(trustId);
    }

    function testSponsorCanRefundAfterDeadline() public {
        uint64 deadline = uint64(block.timestamp + 7 days);
        uint256 trustId = _createTrust(deadline);
        vm.warp(deadline);

        vm.prank(sponsor);
        escrow.refund(trustId);

        assertEq(token.balanceOf(sponsor), AMOUNT * 10);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertFalse(escrow.isReleased(trustId, beneficiary));

        IBrewEscrow.Trust memory trust = escrow.trusts(trustId);
        assertFalse(trust.released);
        assertTrue(trust.refunded);
    }

    function testCannotReleaseAfterRefund() public {
        uint64 deadline = uint64(block.timestamp + 7 days);
        uint256 trustId = _createTrust(deadline);
        vm.warp(deadline);

        vm.prank(sponsor);
        escrow.refund(trustId);

        vm.prank(verifier);
        vm.expectRevert(
            abi.encodeWithSelector(
                IBrewEscrow.TrustAlreadyRefunded.selector,
                trustId
            )
        );
        escrow.releaseTo(trustId, beneficiary);
    }

    function _createTrust(uint64 deadline) internal returns (uint256 trustId) {
        vm.startPrank(sponsor);
        token.approve(address(escrow), AMOUNT);
        trustId = escrow.createTrust(
            beneficiary,
            address(token),
            AMOUNT,
            deadline,
            TEMPLATE_ID
        );
        vm.stopPrank();
    }
}
