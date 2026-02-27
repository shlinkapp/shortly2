import { expect, test, describe } from "bun:test"
import { generateSlug, isValidSlug, isValidUrl } from "./slug"

describe("generateSlug", () => {
    test("generates generic string of length 6", () => {
        const slug = generateSlug()
        expect(slug).toHaveLength(6)
        expect(slug).toMatch(/^[a-z]+$/)
    })

    test("generates string with correct length", () => {
        const slug = generateSlug(10)
        expect(slug).toHaveLength(10)
        expect(slug).toMatch(/^[a-z]+$/)
    })
})

describe("isValidSlug", () => {
    test("validates truthy lowercase character set", () => {
        expect(isValidSlug("validslug")).toBeTrue()
        expect(isValidSlug("valid-slug_123")).toBeTrue()
        expect(isValidSlug("123")).toBeTrue()
    })

    test("validates falsey characters", () => {
        expect(isValidSlug("hello#world")).toBeFalse()
        expect(isValidSlug("hello world")).toBeFalse()
        expect(isValidSlug("")).toBeFalse()
        expect(isValidSlug("x".repeat(51))).toBeFalse()
    })
})

describe("isValidUrl SSRF Check", () => {
    test("validates standard urls", () => {
        expect(isValidUrl("https://example.com")).toBeTrue()
        expect(isValidUrl("http://google.com")).toBeTrue()
        expect(isValidUrl("https://sub.domain.com/path")).toBeTrue()
    })

    test("blocks invalid url schemas", () => {
        expect(isValidUrl("ftp://example.com")).toBeFalse()
        expect(isValidUrl("file:///etc/passwd")).toBeFalse()
        expect(isValidUrl("javascript:alert(1)")).toBeFalse()
        expect(isValidUrl("invalid_url")).toBeFalse()
    })

    test("blocks localhost and local domains", () => {
        expect(isValidUrl("http://localhost:3000")).toBeFalse()
        expect(isValidUrl("http://myapi.local")).toBeFalse()
        expect(isValidUrl("https://localhost/api")).toBeFalse()
    })

    test("blocks private IPv4 addresses", () => {
        // 127.0.0.0/8
        expect(isValidUrl("http://127.0.0.1")).toBeFalse()
        expect(isValidUrl("http://127.0.1.1:8080/")).toBeFalse()
        // 10.0.0.0/8
        expect(isValidUrl("http://10.0.2.1")).toBeFalse()
        // 172.16.0.0/12
        expect(isValidUrl("http://172.16.0.1")).toBeFalse()
        expect(isValidUrl("http://172.31.255.255")).toBeFalse()
        // 192.168.0.0/16
        expect(isValidUrl("http://192.168.1.1")).toBeFalse()
        // 169.254.0.0/16
        expect(isValidUrl("http://169.254.169.254")).toBeFalse()
        // 0.0.0.0/8
        expect(isValidUrl("http://0.0.0.0")).toBeFalse()
        // 100.64.0.0/10
        expect(isValidUrl("http://100.64.0.1")).toBeFalse()
        // 198.18.0.0/15
        expect(isValidUrl("http://198.18.5.5")).toBeFalse()
    })

    test("allows public IPv4 addresses", () => {
        expect(isValidUrl("http://8.8.8.8")).toBeTrue()
        expect(isValidUrl("http://1.1.1.1")).toBeTrue()
        expect(isValidUrl("http://172.15.0.0")).toBeTrue() // Outside 172.16/12
    })

    test("blocks invalid IPv4 formats", () => {
        expect(isValidUrl("http://256.256.256.256")).toBeFalse()
    })

    test("blocks private IPv6 addresses", () => {
        expect(isValidUrl("http://[::1]")).toBeFalse()
        expect(isValidUrl("http://[fe80::1:2:3:4]")).toBeFalse()
        expect(isValidUrl("http://[fc00::abc]")).toBeFalse()
        expect(isValidUrl("http://[fd00::abc]")).toBeFalse()
    })
})
