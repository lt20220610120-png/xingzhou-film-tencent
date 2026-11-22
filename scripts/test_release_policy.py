import unittest

from release_policy import check_release_order, version_tuple


def manifest(version, digest="a" * 64, size=123456):
    return {"version":version, "sha256":digest, "size":size}


class ReleaseOrderTest(unittest.TestCase):
    def test_new_release_can_advance_all_channels(self):
        check_release_order("2.8.100", "a"*64, 123456, {"官网":manifest("2.8.99"),"GitHub":manifest("2.8.98")})

    def test_equal_or_older_release_is_rejected_by_default(self):
        for version in ["2.8.100","2.8.099","2.8.99"]:
            with self.assertRaises(ValueError):
                check_release_order(version,"a"*64,123456,{"官网":manifest("2.8.100")})
        with self.assertRaises(ValueError):
            version_tuple("2.8.100-private.1")

    def test_resume_requires_the_same_artifact_in_advanced_channels(self):
        targets={"官网":manifest("2.8.100"),"GitHub":manifest("2.8.99")}
        check_release_order("2.8.100","a"*64,123456,targets,resume=True)
        with self.assertRaises(ValueError):
            check_release_order("2.8.100","b"*64,123456,targets,resume=True)
        with self.assertRaises(ValueError):
            check_release_order("2.8.99","a"*64,123456,targets,resume=True)

    def test_explicit_rollback_allows_an_older_version_but_cannot_replace_a_published_artifact(self):
        check_release_order("2.8.99","a"*64,123456,{"官网":manifest("2.8.100")},rollback=True)
        with self.assertRaises(ValueError):
            check_release_order("2.8.100","b"*64,123456,{"官网":manifest("2.8.100")},rollback=True)

class ChannelReconciliationTest(unittest.TestCase):
    def test_read_after_lost_put_accepts_only_the_exact_manifest(self):
        import base64,json
        from publish_release import update_repo
        previous,next_manifest=manifest("2.8.99"),manifest("2.8.100")
        state=previous
        calls=[]
        def request(_url,method="GET",data=None,_content_type=None):
            nonlocal state
            calls.append(method)
            if method=="GET":
                return 200,json.dumps({"content":base64.b64encode(json.dumps(state).encode()).decode(),"sha":"fixture"}).encode()
            submitted=json.loads(data)
            self.assertEqual(submitted["sha"],"fixture")
            state=json.loads(base64.b64decode(submitted['content']))
            raise TimeoutError("lost receipt")
        update_repo(request,"fixture/source",next_manifest,json.dumps(next_manifest).encode(),resume=False,rollback=False)
        self.assertEqual(calls,["GET","PUT","GET"])
        self.assertEqual(state,next_manifest)
