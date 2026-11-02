import tempfile
import unittest
from pathlib import Path
from deploy_hf import collect_files, deploy, validate_repo_id

class FakeHub:
    def __init__(self): self.calls=[]
    def create_repo(self,**kw): self.calls.append(('create',kw))
    def upload_folder(self,**kw): self.calls.append(('upload',kw))

class DeploymentTests(unittest.TestCase):
    def test_static_manifest_excludes_server_keys_and_customer_data(self):
        files=collect_files(Path(__file__).resolve().parents[1])
        self.assertIn('static/local.js',files)
        self.assertIn('static/index.html',files)
        for excluded in ('app.py','gradio_app.py','requirements.txt','Dockerfile','.env','data/'):
            self.assertNotIn(excluded,files)
    def test_creation_is_private_static_without_compute_or_secrets(self):
        api=FakeHub()
        deploy(api,'example/cyber-command',Path(__file__).resolve().parents[1])
        self.assertEqual(api.calls[0],('create',dict(repo_id='example/cyber-command',repo_type='space',space_sdk='static',private=True,exist_ok=False)))
        self.assertEqual([x[0] for x in api.calls],['create','upload'])
        self.assertEqual(api.calls[-1][1]['repo_type'],'space')
    def test_bad_id_prevents_network_mutation(self):
        api=FakeHub()
        for value in ('public','../escape','a/b/c','a/b?token=secret'):
            with self.assertRaises(ValueError):validate_repo_id(value)
        with self.assertRaises(ValueError):deploy(api,'bad',Path('.'))
        self.assertEqual(api.calls,[])
    def test_missing_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):collect_files(Path(d))

if __name__=='__main__':unittest.main()
